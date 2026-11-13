import { withOperationChanges } from "@/lib/updates/operation-changes";
import { InventoryError } from "@/lib/inventory/stock-engine";
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
  paymentDeferred: z.boolean().optional(),
  previousBottleReturns: z.array(z.object({ itemId: z.string().regex(/^[A-Za-z0-9_-]{1,150}$/), quantity: z.number().int().min(1).max(100000) }).strict()).max(30).optional(),
  bottleReturns: z.array(z.object({ itemId: z.string().regex(/^[A-Za-z0-9_-]{1,150}$/), quantity: z.number().int().min(0).max(100000) }).strict()).max(30).optional(),
}).strict();

function fail(message: string, code: string, status: number) {
  return NextResponse.json(
    { success: false, error: { code, message } },
    { status, headers: { "Cache-Control": "private, no-store" } },
  );
}

async function handlePOST(
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
    if (parsed.data.action !== "DELIVERED" && parsed.data.previousBottleReturns?.length) return fail("الفارغ السابق يُسجّل عند التسليم فقط.", "INVALID_INPUT", 400);
    const result = await changeEmployeeOrderStatus(
      orderId, parsed.data.action,
      { storeAuthUid: store.authUid, employeeId: operator.employeeId, employeeName: operator.employeeName },
      parsed.data.paymentCollected === true,
      parsed.data.bottleReturns,
      parsed.data.previousBottleReturns,
      parsed.data.paymentDeferred === true,
    );
    return NextResponse.json({ success: true, data: result }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof DeliveryOrderBusinessError || error instanceof InventoryError) {
      return fail(error.message, error.code, error.code === "NOT_FOUND" ? 404 : 409);
    }
    if (isSecurityError(error)) return toSecurityResponse(error);
    console.error("Employee order status update failed:", error);
    return fail("تعذر تحديث حالة الطلب.", "INTERNAL_ERROR", 500);
  }
}

export const POST = withOperationChanges(handlePOST, ["orders","inventory","home"]);
