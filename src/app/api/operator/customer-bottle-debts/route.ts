import { NextResponse } from "next/server";
import { resolveOperatorSession } from "@/lib/auth/operator-session";
import { getFirebaseAdminFirestore } from "@/lib/firebase/admin";
import { getStoreSecurityContext } from "@/lib/security/get-store-security-context";
import { isSecurityError } from "@/lib/security/is-security-error";
import { toSecurityResponse } from "@/lib/security/to-security-response";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  try {
    const store = await getStoreSecurityContext();
    if (!await resolveOperatorSession(store.authUid)) return NextResponse.json({ success: false, error: { message: "سجل دخول الموظف." } }, { status: 401, headers });
    const customerId = new URL(request.url).searchParams.get("customerId");
    if (!customerId || !/^[A-Za-z0-9_-]{1,128}$/.test(customerId)) return NextResponse.json({ success: false, error: { message: "اختر العميل." } }, { status: 400, headers });
    const db = getFirebaseAdminFirestore();
    const customer = (await db.collection("customers").doc(customerId).get()).data();
    if (!customer || customer.isArchived) return NextResponse.json({ success: false, error: { message: "العميل غير متاح." } }, { status: 404, headers });
    const docs = await db.collection("bottleDebtAccounts").where("customerId", "==", customerId).select("itemName", "quantity").get();
    const rows = docs.docs.flatMap(doc => { const data = doc.data(); return Number.isSafeInteger(data.quantity) && data.quantity > 0 && typeof data.itemName === "string" ? [{ label: data.itemName, quantity: data.quantity as number }] : []; });
    return NextResponse.json({ success: true, data: rows }, { headers });
  } catch (error) {
    if (isSecurityError(error)) return toSecurityResponse(error);
    console.error("Load operational bottle reminder:", error);
    return NextResponse.json({ success: false, error: { message: "تعذر تحميل تنبيه القوارير." } }, { status: 500, headers });
  }
}
