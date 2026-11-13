import { NextResponse } from "next/server";
import { getAdminReports } from "@/lib/admin/admin-reports";
import { getAdminSecurityContext } from "@/lib/security/get-admin-security-context";
import { isSecurityError } from "@/lib/security/is-security-error";
import { toSecurityResponse } from "@/lib/security/to-security-response";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  try {
    await getAdminSecurityContext();
    const p = new URL(request.url).searchParams, period = p.get("period") ?? "today";
    if (!["today", "yesterday", "week", "month", "lastMonth", "custom"].includes(period)) return NextResponse.json({ success: false, error: { message: "الفترة غير صالحة." } }, { status: 400, headers });
    const data = await getAdminReports(period as "today" | "yesterday" | "week" | "month" | "lastMonth" | "custom", p.get("start") ?? undefined, p.get("end") ?? undefined);
    return NextResponse.json({ success: true, data }, { headers });
  } catch (error) {
    if (isSecurityError(error)) return toSecurityResponse(error);
    if (error instanceof Error && error.message === "INVALID_REPORT_RANGE") return NextResponse.json({ success: false, error: { message: "اختر فترة صحيحة لا تتجاوز 90 يومًا، وتنتهي اليوم أو قبله." } }, { status: 400, headers });
    console.error("Admin reports failed", error);
    return NextResponse.json({ success: false, error: { message: "تعذر تحميل التقارير. أعد المحاولة." } }, { status: 500, headers });
  }
}
