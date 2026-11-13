import { withOperationChanges } from "@/lib/updates/operation-changes";
import { NextResponse } from "next/server";
import { z } from "zod";
import { assignBookletToCustomer, BookletError } from "@/lib/coupons/booklet-service";
import { getAdminSecurityContext } from "@/lib/security/get-admin-security-context";
import { hasValidOrigin } from "@/lib/security/has-valid-origin";
import { isSecurityError } from "@/lib/security/is-security-error";
import { toSecurityResponse } from "@/lib/security/to-security-response";

import { sellStoreBooklet, storeBookletOptions } from "@/lib/coupons/store-booklet-sale";

export const dynamic = "force-dynamic";
const schema=z.discriminatedUnion("action",[
z.object({action:z.literal("SALE"),bookletId:z.string().regex(/^[a-f0-9]{64}$/),requestId:z.string().uuid(),paymentMethod:z.enum(["CASH","CLICK"]),expectedPriceFils:z.number().int().positive().max(1_000_000),financialDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),period:z.enum(["MORNING","EVENING"]),confirmed:z.literal(true)}).strict(),
z.object({action:z.literal("PREVIOUS"),bookletId:z.string().regex(/^[a-f0-9]{64}$/),confirmed:z.literal(true)}).strict()]);
export async function GET(){try {await getAdminSecurityContext();return NextResponse.json({success:true,data:await storeBookletOptions()},{headers:{"Cache-Control":"private, no-store"}});}catch(error){if(isSecurityError(error))return toSecurityResponse(error);if(error instanceof BookletError)return fail(error.message,error.code,409);console.error("Store booklet options failed",error);return fail("تعذّر تحميل بيانات البيع.","INTERNAL_ERROR",500);}}
type Context = { params: Promise<{ customerId: string }> };
function fail(message: string, code: string, status: number) {
  return NextResponse.json({ success: false, error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } });
}
async function handlePOST(request: Request, context: Context) {
  try {
    const admin = await getAdminSecurityContext();
    if (!hasValidOrigin(request)) return fail("الطلب غير مسموح.", "FORBIDDEN", 403);
    const { customerId } = await context.params;
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(customerId)) return fail("معرف العميل غير صالح.", "INVALID_CUSTOMER", 400);
    let body: unknown;
    try { body = await request.json(); } catch { return fail("بيانات غير صالحة.", "INVALID_INPUT", 400); }
    const parsed = schema.safeParse(body);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "بيانات غير صالحة.", "INVALID_INPUT", 400);
    const result = parsed.data.action === "SALE" ? await sellStoreBooklet({ ...parsed.data, customerId, adminUid: admin.authUid }) : await assignBookletToCustomer({bookletId:parsed.data.bookletId, customerId, adminUid:admin.authUid, reason:"ربط دفتر مدفوع سابقًا دون تحصيل جديد"});
    return NextResponse.json({ success: true, data: result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof BookletError) return fail(error.message, error.code, 409);
    if (isSecurityError(error)) return toSecurityResponse(error);
    console.error("Admin booklet assignment failed:", error);
    return fail("تعذّر إصدار الدفتر للعميل.", "INTERNAL_ERROR", 500);
  }
}

export const POST = withOperationChanges(handlePOST, ["orders","inventory","home","catalog"]);
