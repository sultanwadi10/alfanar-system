import { withOperationChanges } from "@/lib/updates/operation-changes";
import { NextResponse } from "next/server";
import { catalogSnapshot, catalogRequestSchema, executeCatalog } from "@/lib/inventory/catalog-service";
import { InventoryError } from "@/lib/inventory/stock-engine";
import { getAdminSecurityContext } from "@/lib/security/get-admin-security-context";
import { hasValidOrigin } from "@/lib/security/has-valid-origin";
import { isSecurityError } from "@/lib/security/is-security-error";
import { toSecurityResponse } from "@/lib/security/to-security-response";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
function failure(error: unknown) {
  if (isSecurityError(error)) return toSecurityResponse(error);
  if (error instanceof InventoryError) return NextResponse.json({ success: false, error: { code: error.code, message: error.message } }, { status: 409, headers });
  console.error("Catalog request failed", error);
  return NextResponse.json({ success: false, error: { message: "تعذر حفظ بطاقة الصنف. أعد المحاولة بنفس النموذج." } }, { status: 500, headers });
}
export async function GET() {
  try { await getAdminSecurityContext(); return NextResponse.json({ success: true, data: await catalogSnapshot() }, { headers }); } catch (error) { return failure(error); }
}
async function handlePOST(request: Request) {
  try {
    const admin = await getAdminSecurityContext();
    if (!hasValidOrigin(request)) return NextResponse.json({ success: false, error: { message: "الطلب غير مسموح." } }, { status: 403, headers });
    const parsed = catalogRequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ success: false, error: { message: "تحقق من الحقول المطلوبة والكميات والأسعار." } }, { status: 400, headers });
    return NextResponse.json({ success: true, data: await executeCatalog(parsed.data, admin.authUid) }, { headers });
  } catch (error) { return failure(error); }
}

export const POST = withOperationChanges(handlePOST, ["catalog","inventory","orders"]);
