import { withOperationChanges } from "@/lib/updates/operation-changes";
import { NextResponse } from "next/server";
import { customerBottleDebts, executeInventoryCommand, inventoryMovements, inventoryRequestSchema, inventorySnapshot, searchInventoryCustomers } from "@/lib/inventory/admin-inventory";
import { InventoryError } from "@/lib/inventory/stock-engine";
import { getAdminSecurityContext } from "@/lib/security/get-admin-security-context";
import { hasValidOrigin } from "@/lib/security/has-valid-origin";
import { isSecurityError } from "@/lib/security/is-security-error";
import { toSecurityResponse } from "@/lib/security/to-security-response";
const headers = { "Cache-Control": "private, no-store" };
export const dynamic = "force-dynamic";
function failure(error: unknown) {
  if (isSecurityError(error)) {
    if (error.statusCode === 401) return NextResponse.json({ success: false, error: { code: error.code, message: "جلسة الإدارة غير متاحة أو انتهت. سجّل دخول الإدارة مجددًا من نفس عنوان الموقع، ثم أعد المحاولة." } }, { status: 401, headers });
    return toSecurityResponse(error);
  }
  if (error instanceof InventoryError) return NextResponse.json({ success: false, error: { code: error.code, message: error.message } }, { status: 409, headers });
  console.error("Inventory request failed:", error);
  return NextResponse.json({ success: false, error: { code: "INTERNAL_ERROR", message: "تعذر تنفيذ حركة المخزون. حاول مجددًا." } }, { status: 500, headers });
}
export async function GET(request: Request) {
  try {
    await getAdminSecurityContext();
    const params = new URL(request.url).searchParams;
    if (params.get("view") === "customers") return NextResponse.json({ success: true, data: await searchInventoryCustomers((params.get("q") ?? "").trim()) }, { headers });
    const cursor = params.get("cursor") || undefined;
    const itemId = params.get("itemId") || undefined;
    if ([cursor, itemId].some(v => v && !/^[A-Za-z0-9_-]{1,150}$/.test(v))) throw new InventoryError("INVALID_QUERY", "استعلام المخزون غير صالح.");
    const customerId = params.get("customerId");
    if (params.get("view") === "debts" && (!customerId || !/^[A-Za-z0-9_-]{1,150}$/.test(customerId))) throw new InventoryError("INVALID_QUERY", "اختر العميل.");
    const data = params.get("view") === "movements" ? await inventoryMovements(cursor, itemId) : params.get("view") === "debts" ? await customerBottleDebts(customerId!) : await inventorySnapshot();
    return NextResponse.json({ success: true, data }, { headers });
  } catch (error) { return failure(error); }
}
async function handlePOST(request: Request) {
  try {
    const admin = await getAdminSecurityContext();
    if (!hasValidOrigin(request)) return NextResponse.json({ success: false, error: { message: "الطلب غير مسموح." } }, { status: 403, headers });
    const parsed = inventoryRequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ success: false, error: { code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "تحقق من بيانات الحركة." } }, { status: 400, headers });
    if (["CREATE_ITEM", "EDIT_ITEM", "UPDATE_ITEM", "SET_POLICY", "CREATE_COOLED"].includes(parsed.data.command.action)) return NextResponse.json({ success: false, error: { code: "USE_CATALOG", message: "تعريف الأصناف والأسعار والربط من صفحة الأصناف والأسعار." } }, { status: 409, headers });
    return NextResponse.json({ success: true, data: await executeInventoryCommand(parsed.data, admin.authUid) }, { headers });
  } catch (error) { return failure(error); }
}

export const POST = withOperationChanges(handlePOST, ["inventory","orders","home"]);
