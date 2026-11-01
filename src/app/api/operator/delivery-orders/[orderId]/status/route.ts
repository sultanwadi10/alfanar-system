import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveOperatorSession } from "@/lib/auth/operator-session";
import { DeliveryOrderBusinessError } from "@/lib/orders/delivery-order-repository";
import { changeEmployeeOrderStatus } from "@/lib/orders/delivery-order-operations";
import { getStoreSecurityContext } from "@/lib/security/get-store-security-context";
import { hasValidOrigin } from "@/lib/security/has-valid-origin";
import { isSecurityError } from "@/lib/security/is-security-error";
import { toSecurityResponse } from "@/lib/security/to-security-response";

const schema = z.object({
  action: z.enum(["READY", "DELIVERED", "CANCELLED"]),
  paymentCollected: z.boolean().optional(),
}).strict();

function fail(message: string, code: string, status: number) {
  return NextResponse.json(
    { success: false, error: { code, message } },
    { status, headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  try {
    const store = await getStoreSecurityContext();
    const operator = await resolveOperatorSession(store.authUid);
    if (!operator) return fail("يجب تسجيل دخول الموظف.", "OPERATOR_REQUIRED", 401);
    if (!hasValidOrigin(request)) return fail("الطلب غير مسموح.", "FORBIDDEN", 403);
    const { orderId } = await params;
    if (!/^\d{8}-\d{3,8}$/.test(orderId)) {
      return fail("رقم الطلب غير صالح.", "INVALID_ORDER", 400);
    }
    let body: unknown;
    try { body = await request.json(); }
    catch { return fail("بيانات العملية غير صالحة.", "INVALID_INPUT", 400); }
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "عملية غير صالحة.", "INVALID_INPUT", 400);
    }
    const result = await changeEmployeeOrderStatus(
      orderId, parsed.data.action,
      { storeAuthUid: store.authUid, employeeId: operator.employeeId, employeeName: operator.employeeName },
      parsed.data.paymentCollected === true,
    );
    return NextResponse.json({ success: true, data: result }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof DeliveryOrderBusinessError) {
      return fail(error.message, error.code, error.code === "NOT_FOUND" ? 404 : 409);
    }
    if (isSecurityError(error)) return toSecurityResponse(error);
    console.error("Employee order status update failed:", error);
    return fail("تعذر تحديث حالة الطلب.", "INTERNAL_ERROR", 500);
  }
}
