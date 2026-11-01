import { NextResponse } from "next/server";
import { z } from "zod";
import { assignBookletToCustomer, BookletError } from "@/lib/coupons/booklet-service";
import { getAdminSecurityContext } from "@/lib/security/get-admin-security-context";
import { hasValidOrigin } from "@/lib/security/has-valid-origin";
import { isSecurityError } from "@/lib/security/is-security-error";
import { toSecurityResponse } from "@/lib/security/to-security-response";

export const dynamic = "force-dynamic";
const schema = z.object({
  bookletId: z.string().regex(/^[a-f0-9]{64}$/, "معرّف الدفتر غير صالح."),
  reason: z.string().trim().min(5, "اكتب سببًا واضحًا للإصدار الإداري.").max(200),
}).strict();
type Context = { params: Promise<{ customerId: string }> };
function fail(message: string, code: string, status: number) {
  return NextResponse.json({ success: false, error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: Request, context: Context) {
  try {
    const admin = await getAdminSecurityContext();
    if (!hasValidOrigin(request)) return fail("الطلب غير مسموح.", "FORBIDDEN", 403);
    const { customerId } = await context.params;
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(customerId)) return fail("معرف العميل غير صالح.", "INVALID_CUSTOMER", 400);
    let body: unknown;
    try { body = await request.json(); } catch { return fail("بيانات غير صالحة.", "INVALID_INPUT", 400); }
    const parsed = schema.safeParse(body);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "بيانات غير صالحة.", "INVALID_INPUT", 400);
    const result = await assignBookletToCustomer({ ...parsed.data, customerId, adminUid: admin.authUid });
    return NextResponse.json({ success: true, data: result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof BookletError) return fail(error.message, error.code, 409);
    if (isSecurityError(error)) return toSecurityResponse(error);
    console.error("Admin booklet assignment failed:", error);
    return fail("تعذّر إصدار الدفتر للعميل.", "INTERNAL_ERROR", 500);
  }
}
