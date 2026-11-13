import { NextResponse } from "next/server";
import { getDashboardStatus } from "@/lib/admin/dashboard-overview";
import { getAdminSecurityContext } from "@/lib/security/get-admin-security-context";
import { isSecurityError } from "@/lib/security/is-security-error";
import { toSecurityResponse } from "@/lib/security/to-security-response";
export const dynamic = "force-dynamic";
export async function GET() {
  try { await getAdminSecurityContext(); return NextResponse.json({ success: true, data: await getDashboardStatus() }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { if (isSecurityError(error)) return toSecurityResponse(error); console.error("Dashboard status failed", error); return NextResponse.json({ success: false, error: { message: "تعذر تحميل حالة التشغيل." } }, { status: 500, headers: { "Cache-Control": "private, no-store" } }); }
}
