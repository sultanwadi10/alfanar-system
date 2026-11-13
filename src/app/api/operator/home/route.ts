import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { resolveOperatorSession } from "@/lib/auth/operator-session";
import { getFirebaseAdminFirestore } from "@/lib/firebase/admin";
import { jordanDayKey } from "@/lib/orders/delivery-order-operations";
import { getStoreSecurityContext } from "@/lib/security/get-store-security-context";
import { isSecurityError } from "@/lib/security/is-security-error";
import { toSecurityResponse } from "@/lib/security/to-security-response";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const statuses = ["NEW", "READY", "DELIVERED", "CANCELLED"] as const;

export async function GET() {
  try {
    // Same device, runtime, Firebase and employee checks as the existing APIs.
    const store = await getStoreSecurityContext();
    const operator = await resolveOperatorSession(store.authUid);
    if (!operator) {
      return NextResponse.json({ success: false, error: { code: "OPERATOR_REQUIRED", message: "يجب تسجيل دخول الموظف." } }, { status: 401, headers });
    }
    const day = jordanDayKey();
    const start = new Date(`${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}T00:00:00+03:00`);
    const db = getFirebaseAdminFirestore();
    // Single-field queries need no additional composite indexes. Projections
    // exclude customer details, amounts, balances, serials and admin notes.
    const [orders, sales] = await Promise.all([
      db.collection("deliveryOrders").where("orderDateKey", "==", day)
        .select("storeAuthUid", "orderNumber", "status", "createdAt", "updatedAt").get(),
      db.collection("directSales").where("createdAt", ">=", Timestamp.fromDate(start))
        .where("createdAt", "<", Timestamp.fromMillis(start.getTime() + 86400000))
        .select("storeAuthUid", "createdAt").get(),
    ]);
    const counts = { total: 0, ready: 0, delivered: 0 };
    const recent: Array<{ id: string; kind: "ORDER" | "SALE"; number: string; status: string; at: string }> = [];
    for (const doc of orders.docs) {
      const data = doc.data();
      if (data.storeAuthUid !== store.authUid || !statuses.includes(data.status)) continue;
      counts.total++;
      if (data.status === "READY") counts.ready++;
      if (data.status === "DELIVERED") counts.delivered++;
      const at = data.updatedAt instanceof Timestamp ? data.updatedAt : data.createdAt;
      if (at instanceof Timestamp) recent.push({ id: doc.id, kind: "ORDER", number: typeof data.orderNumber === "string" ? data.orderNumber : "", status: data.status, at: at.toDate().toISOString() });
    }
    for (const doc of sales.docs) {
      const data = doc.data();
      if (data.storeAuthUid !== store.authUid || !(data.createdAt instanceof Timestamp)) continue;
      recent.push({ id: doc.id, kind: "SALE", number: "", status: "SALE", at: data.createdAt.toDate().toISOString() });
    }
    recent.sort((a, b) => b.at.localeCompare(a.at));
    return NextResponse.json({ success: true, data: { day, counts, recent: recent.slice(0, 5) } }, { headers });
  } catch (error) {
    if (isSecurityError(error)) return toSecurityResponse(error);
    console.error("Load employee home failed:", error);
    return NextResponse.json({ success: false, error: { code: "INTERNAL_ERROR", message: "تعذر تحميل ملخص اليوم." } }, { status: 500, headers });
  }
}
