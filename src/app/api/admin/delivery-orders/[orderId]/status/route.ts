import { withOperationChanges } from "@/lib/updates/operation-changes";
import { InventoryError } from "@/lib/inventory/stock-engine";
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
    paymentDeferred: z.boolean().optional(),
  bottleReturns: z.array(z.object({ itemId: z.string().regex(/^[A-Za-z0-9_-]{1,150}$/), quantity: z.number().int().min(0).max(100000) }).strict()).max(30).optional(),
  }).strict(),
  z.object({
    action: z.literal("CANCELLED"),
    reason: z.string().trim().max(250).default("إلغاء الطلب من الإدارة"),
  }).strict(),
]);

function fail(message: string, code: string, status: number) {
  return NextResponse.json({ success: false, error: { message, code } }, {
    status, headers: { "Cache-Control": "private, no-store" },
  });
}

async function handlePOST(
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
      paymentDeferred: parsed.data.action === "DELIVERED" && parsed.data.paymentDeferred === true,
      reason: parsed.data.action === "CANCELLED" ? parsed.data.reason : "",
      bottleReturns: parsed.data.action === "DELIVERED" ? parsed.data.bottleReturns : undefined,
    });
    return NextResponse.json({ success: true, data: result }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof DeliveryOrderBusinessError || error instanceof InventoryError) {
      return fail(error.message, error.code, error.code === "NOT_FOUND" ? 404 : 409);
    }
    if (isSecurityError(error)) return toSecurityResponse(error);
    console.error("Admin delivery order status POST failed", error);
    return fail("تعذر تحديث حالة الطلب.", "INTERNAL_ERROR", 500);
  }
}

export const POST = withOperationChanges(handlePOST, ["orders","inventory","home"]);
