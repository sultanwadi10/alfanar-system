import { withOperationChanges } from "@/lib/updates/operation-changes";
import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveOperatorSession } from "@/lib/auth/operator-session";
import { BookletError, confirmBookletHandover } from "@/lib/coupons/booklet-service";
import { getStoreSecurityContext } from "@/lib/security/get-store-security-context";
import { hasValidOrigin } from "@/lib/security/has-valid-origin";
import { isSecurityError } from "@/lib/security/is-security-error";
import { toSecurityResponse } from "@/lib/security/to-security-response";

const schema = z.object({ paymentMethod: z.enum(["CASH", "CLICK"]), expectedPriceFils: z.number().int().positive(), confirmed: z.literal(true) }).strict();
function fail(message: string, code: string, status: number) {
  return NextResponse.json({ success: false, error: { code, message } }, { status });
}
async function handlePOST(request: Request, context: { params: Promise<{ orderId: string }> }) {
  try {
    const store = await getStoreSecurityContext();
    const operator = await resolveOperatorSession(store.authUid);
    if (!operator) return fail("يجب تسجيل دخول الموظف.", "OPERATOR_REQUIRED", 401);
    if (!hasValidOrigin(request)) return fail("الطلب غير مسموح.", "FORBIDDEN", 403);
    const { orderId } = await context.params;
    if (!/^\d{8}-\d{3,8}$/.test(orderId)) return fail("رقم الطلب غير صالح.", "INVALID_ID", 400);
    let body: unknown;
    try { body = await request.json(); } catch { return fail("البيانات غير صالحة.", "INVALID_INPUT", 400); }
    const parsed = schema.safeParse(body);
    if (!parsed.success) return fail("يلزم تأكيد تسليم الدفتر وتحديد طريقة تحصيل ثمنه.", "INVALID_INPUT", 400);
    const data = await confirmBookletHandover(orderId,
      { employeeId: operator.employeeId, employeeName: operator.employeeName, storeAuthUid: store.authUid },
      parsed.data.paymentMethod, parsed.data.expectedPriceFils);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (error instanceof BookletError) return fail(error.message, error.code, error.code === "NOT_FOUND" ? 404 : 409);
    if (isSecurityError(error)) return toSecurityResponse(error);
    console.error("Employee booklet handover failed", error);
    return fail("تعذر تسجيل تسليم الدفتر.", "INTERNAL_ERROR", 500);
  }
}

export const POST = withOperationChanges(handlePOST, ["orders","inventory","home"]);
