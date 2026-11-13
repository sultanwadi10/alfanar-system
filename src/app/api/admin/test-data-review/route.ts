import { NextResponse } from "next/server";
import { testDataReview } from "@/lib/inventory/test-data-review";
import { getAdminSecurityContext } from "@/lib/security/get-admin-security-context";
import { isSecurityError } from "@/lib/security/is-security-error";
import { toSecurityResponse } from "@/lib/security/to-security-response";
export const dynamic = "force-dynamic";
export async function GET() {
  try { await getAdminSecurityContext(); return NextResponse.json({ success: true, data: await testDataReview() }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { if (isSecurityError(error)) return toSecurityResponse(error); console.error("Test-data review failed", error); return NextResponse.json({ success: false, error: { message: "تعذر تحميل تقرير المراجعة." } }, { status: 500, headers: { "Cache-Control": "private, no-store" } }); }
}
