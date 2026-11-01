import { NextResponse } from "next/server";
import { z } from "zod";

import { DeliveryOrderBusinessError } from "@/lib/orders/delivery-order-repository";
import { changeAdminDeliveryOrderStatus } from "@/lib/orders/admin-delivery-orders";
import { getAdminSecurityContext } from "@/lib/security/get-admin-security-context";
import { hasValidOrigin } from "@/lib/security/has-valid-origin";
import { isSecurityError } from "@/lib/security/is-security-error";
import { toSecurityResponse } from "@/lib/security/to-security-response";

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("DELIVERED"),
    paymentCollected: z.boolean(),
  }).strict(),
  z.object({
    action: z.literal("CANCELLED"),
    reason: z.string().trim().min(5, "اكتب سبب إلغاء واضحًا من 5 أحرف على الأقل.")
      .max(250, "سبب الإلغاء طويل جدًا."),
  }).strict(),
]);

function fail(message: string, code: string, status: number) {
  return NextResponse.json({ success: false, error: { message, code } }, {
    status, headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  try {
    const admin = await getAdminSecurityContext();
    if (!hasValidOrigin(request)) return fail("العملية غير مسموحة.", "FORBIDDEN", 403);
    const { orderId } = await params;
    if (!/^\d{8}-\d{3,8}$/.test(orderId)) {
      return fail("رقم الطلب غير صالح.", "INVALID_ORDER", 400);
    }
    let body: unknown;
    try { body = await request.json(); }
    catch { return fail("البيانات غير صالحة.", "INVALID_INPUT", 400); }
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "عملية غير صالحة.", "VALIDATION_ERROR", 400);
    }
    const result = await changeAdminDeliveryOrderStatus(orderId, parsed.data.action, admin.authUid, {
      paymentCollected: parsed.data.action === "DELIVERED" && parsed.data.paymentCollected,
      reason: parsed.data.action === "CANCELLED" ? parsed.data.reason : "",
    });
    return NextResponse.json({ success: true, data: result }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof DeliveryOrderBusinessError) {
      return fail(error.message, error.code, error.code === "NOT_FOUND" ? 404 : 409);
    }
    if (isSecurityError(error)) return toSecurityResponse(error);
    console.error("Admin delivery order status POST failed", error);
    return fail("تعذر تحديث حالة الطلب.", "INTERNAL_ERROR", 500);
  }
}
