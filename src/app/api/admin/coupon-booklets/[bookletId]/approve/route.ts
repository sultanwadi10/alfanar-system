import { withOperationChanges } from "@/lib/updates/operation-changes";
import { NextResponse } from "next/server";
import { z } from "zod";
import { approveBookletRequest, BookletError } from "@/lib/coupons/booklet-service";
import { getAdminSecurityContext } from "@/lib/security/get-admin-security-context";
import { hasValidOrigin } from "@/lib/security/has-valid-origin";
import { isSecurityError } from "@/lib/security/is-security-error";
import { toSecurityResponse } from "@/lib/security/to-security-response";

const schema = z.object({ orderId: z.string().regex(/^\d{8}-\d{3,8}$/) }).strict();
function fail(message: string, code: string, status: number) {
  return NextResponse.json({ success: false, error: { code, message } }, { status });
}
async function handlePOST(request: Request, context: { params: Promise<{ bookletId: string }> }) {
  try {
    const admin = await getAdminSecurityContext();
    if (!hasValidOrigin(request)) return fail("الطلب غير مسموح.", "FORBIDDEN", 403);
    const { bookletId } = await context.params;
    if (!/^[a-f0-9]{64}$/.test(bookletId)) return fail("معرف الدفتر غير صالح.", "INVALID_ID", 400);
    let body: unknown;
    try { body = await request.json(); } catch { return fail("البيانات غير صالحة.", "INVALID_INPUT", 400); }
    const parsed = schema.safeParse(body);
    if (!parsed.success) return fail("رقم الطلب غير صالح.", "INVALID_INPUT", 400);
    const data = await approveBookletRequest(parsed.data.orderId, bookletId, admin.authUid);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (error instanceof BookletError) return fail(error.message, error.code, 409);
    if (isSecurityError(error)) return toSecurityResponse(error);
    console.error("Coupon booklet approve failed", error);
    return fail("تعذر اعتماد الدفتر.", "INTERNAL_ERROR", 500);
  }
}

export const POST = withOperationChanges(handlePOST, ["orders","inventory","home","catalog"]);
