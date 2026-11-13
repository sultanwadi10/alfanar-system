import { NextResponse } from "next/server";
import { resolveOperatorSession } from "@/lib/auth/operator-session";
import { getStoreSecurityContext } from "@/lib/security/get-store-security-context";
import { getFirebaseAdminFirestore } from "@/lib/firebase/admin";
import { jordanDayKey } from "@/lib/orders/delivery-order-operations";
import { bottleRequirements, keyFor, stockCollections as C } from "@/lib/inventory/stock-engine";
import { isSecurityError } from "@/lib/security/is-security-error";
import { toSecurityResponse } from "@/lib/security/to-security-response";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(_request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    const store = await getStoreSecurityContext();
    if (!await resolveOperatorSession(store.authUid)) return NextResponse.json({ success: false, error: { message: "سجّل دخول الموظف." } }, { status: 401, headers });
    const { orderId } = await params;
    if (!/^\d{8}-\d{3,8}$/.test(orderId)) return NextResponse.json({ success: false, error: { message: "رقم الطلب غير صالح." } }, { status: 400, headers });
    const db = getFirebaseAdminFirestore(), order = (await db.collection("deliveryOrders").doc(orderId).get()).data();
    if (!order || order.storeAuthUid !== store.authUid || order.orderDateKey !== jordanDayKey()) return NextResponse.json({ success: false, error: { message: "الطلب غير متاح." } }, { status: 404, headers });
    if (order.status !== "READY" || !bottleRequirements(order.inventoryPlan).length) return NextResponse.json({ success: true, data: [] }, { headers });
    const [debts, items] = await Promise.all([db.collection(C.debts).where("customerId", "==", order.customerId).get(), db.collection(C.items).get()]);
    // Older debt documents did not contain itemId. Recover it only from its
    // canonical customer/item key; expose operational labels/counts only.
    const byDebt = new Map(items.docs.filter(d => d.data().kind === "BOTTLE_POOL").map(d => [keyFor(`${order.customerId}:${d.id}`), d]));
    const rows = debts.docs.flatMap(doc => {
      const data = doc.data(), item = byDebt.get(doc.id);
      return item && Number.isSafeInteger(data.quantity) && data.quantity > 0 ? [{ itemId: item.id, label: String(data.itemName ?? item.data().name), quantity: data.quantity as number }] : [];
    });
    return NextResponse.json({ success: true, data: rows }, { headers });
  } catch (error) {
    if (isSecurityError(error)) return toSecurityResponse(error);
    console.error("Load delivery bottle debts failed", error);
    return NextResponse.json({ success: false, error: { message: "تعذر تحميل العهدة السابقة." } }, { status: 500, headers });
  }
}
