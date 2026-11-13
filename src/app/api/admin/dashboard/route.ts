import { NextResponse } from "next/server";
import { getDashboardOverview } from "@/lib/admin/dashboard-overview";
import { getAdminSecurityContext } from "@/lib/security/get-admin-security-context";
import { isSecurityError } from "@/lib/security/is-security-error";
import { toSecurityResponse } from "@/lib/security/to-security-response";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  try {
    await getAdminSecurityContext();
    const period = new URL(request.url).searchParams.get("period") ?? "today";
    if (period !== "today" && period !== "yesterday" && period !== "week") return NextResponse.json({ success: false, error: { message: "الفترة غير صالحة." } }, { status: 400, headers });
    return NextResponse.json({ success: true, data: await getDashboardOverview(period) }, { headers });
  } catch (error) {
    if (isSecurityError(error)) return toSecurityResponse(error);
    console.error("Dashboard overview failed", error);
    return NextResponse.json({ success: false, error: { message: "تعذر تحديث لوحة الإدارة. أعد المحاولة." } }, { status: 500, headers });
  }
}
