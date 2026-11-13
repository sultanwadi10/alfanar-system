import { withOperationChanges } from "@/lib/updates/operation-changes";
import { NextResponse } from "next/server";
import { getAdminSecurityContext } from "@/lib/security/get-admin-security-context";
import { hasValidOrigin } from "@/lib/security/has-valid-origin";
import { isSecurityError } from "@/lib/security/is-security-error";
import { toSecurityResponse } from "@/lib/security/to-security-response";

// The unnumbered legacy wallet is retired. Keep records read-only; all NEW
// coupons must originate from a physical serial-numbered booklet.
async function handlePOST(request: Request) {
  try {
    await getAdminSecurityContext();
    if (!hasValidOrigin(request)) {
      return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: "الطلب غير مسموح." } }, { status: 403 });
    }
    return NextResponse.json({ success: false, error: {
      code: "LEGACY_WALLET_RETIRED",
      message: "تم إيقاف إضافة الكوبونات غير المرقمة. استخدم إصدار دفتر من محفظة العميل.",
    } }, { status: 410, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (isSecurityError(error)) return toSecurityResponse(error);
    console.error("Legacy coupon endpoint:", error);
    return NextResponse.json({ success: false, error: { code: "INTERNAL_ERROR", message: "تعذر تنفيذ الطلب." } }, { status: 500 });
  }
}

export const POST = withOperationChanges(handlePOST, ["orders","inventory","home","catalog"]);
