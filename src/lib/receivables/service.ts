import "server-only";
import { createHash } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getFirebaseAdminFirestore } from "@/lib/firebase/admin";
import { getActiveStoreShiftDocumentId } from "@/lib/shifts/shift-repository";
import { DEFAULT_SHIFT_TIMES, shiftTimeSnapshot } from "@/lib/shifts/shift-payroll";
import type { EmployeeShiftTimeSettings } from "@/types/employee-schedule";
import { ReceivableError, receivableFromOrder, unsigned } from "./records";
const LIMIT = 1000;
const validId = (value: string) => /^[A-Za-z0-9_-]{1,150}$/.test(value);
function checkCustomer(id: string) { if (!validId(id)) throw new ReceivableError("INVALID_CUSTOMER", "معرّف العميل غير صالح."); }
export async function customerAccount(customerId: string, storeAuthUid?: string) {
  checkCustomer(customerId);
  const db = getFirebaseAdminFirestore();
  const [debts, orders, booklets, receipts] = await Promise.all([
    db.collection("customerReceivables").where("customerId", "==", customerId).limit(LIMIT + 1).get(),
    db.collection("deliveryOrders").where("customerId", "==", customerId).limit(LIMIT + 1).get(),
    db.collection("couponBooklets").where("customerId", "==", customerId).limit(LIMIT + 1).get(),
    storeAuthUid ? Promise.resolve(null) : db.collection("receivableCollections").where("customerId", "==", customerId).limit(LIMIT + 1).get(),
  ]);
  const rows = new Map<string, ReturnType<typeof receivableFromOrder>>();
  for (const doc of debts.docs.slice(0, LIMIT)) {
    const d = doc.data(); if (storeAuthUid && d.storeAuthUid !== storeAuthUid) continue;
    if (!["MONEY", "COUPON"].includes(d.kind) || unsigned(d.original) !== unsigned(d.settled) + unsigned(d.outstanding)) throw new ReceivableError("INVALID_BALANCE", "بيانات المستحق غير متسقة.");
    rows.set(doc.id, d as ReturnType<typeof receivableFromOrder>);
  }
  // Older pending coupon orders are displayed and can be settled without a migration.
  for (const doc of orders.docs.slice(0, LIMIT)) {
    const d = doc.data(); if (storeAuthUid && d.storeAuthUid !== storeAuthUid) continue;
    if (d.status === "DELIVERED" && d.paymentMethod === "COUPON" && unsigned(d.pendingCouponQuantity ?? 0) > 0 && !rows.has(`order_${doc.id}`)) rows.set(`order_${doc.id}`, receivableFromOrder(doc.id, d, d.deliveredAt ?? d.createdAt, "COUPON", d.pendingCouponQuantity));
  }
  let availableCoupons = 0;
  for (const doc of booklets.docs.slice(0, LIMIT)) {
    const b = doc.data(); if (b.status !== "ACTIVE") continue;
    const remaining = unsigned(b.remainingCoupons), reserved = unsigned(b.reservedCoupons);
    if (remaining > 22 || reserved > remaining) throw new ReceivableError("INVALID_BALANCE", "رصيد دفتر الكوبونات غير متسق.");
    availableCoupons += remaining - reserved;
  }
  const outstanding = [...rows.entries()].filter(([, d]) => d.outstanding > 0).map(([id, d]) => ({ id, orderId: d.orderId, orderNumber: d.orderNumber, kind: d.kind, outstanding: d.outstanding, original: d.original, settled: d.settled, expectedMethod: d.expectedMethod, at: d.createdAt instanceof Timestamp ? d.createdAt.toDate().toISOString() : null })).sort((a, b) => (a.at ?? "").localeCompare(b.at ?? ""));
  const partial = [debts, orders, booklets, receipts].some(s => s && s.size > LIMIT);
  return { moneyDueFils: outstanding.filter(d => d.kind === "MONEY").reduce((n, d) => n + d.outstanding, 0), couponsDue: outstanding.filter(d => d.kind === "COUPON").reduce((n, d) => n + d.outstanding, 0), availableCoupons, partial, outstanding,
    receipts: receipts?.docs.slice(0, LIMIT).map(doc => { const d = doc.data(); return { id: doc.id, orderNumber: String(d.orderNumber ?? ""), amount: unsigned(d.amount), method: String(d.method), at: d.receivedAt instanceof Timestamp ? d.receivedAt.toDate().toISOString() : null }; }).sort((a, b) => (b.at ?? "").localeCompare(a.at ?? "")) ?? [] };
}
export async function settleReceivable(input: { requestId: string; customerId: string; receivableId: string; amount: number; method: "CASH" | "CLICK" | "COUPON"; adminUid: string }) {
  checkCustomer(input.customerId);
  if (!/^order_\d{8}-\d{3,8}$/.test(input.receivableId) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId) || !Number.isSafeInteger(input.amount) || input.amount < 1 || input.amount > 1_000_000_000 || !["CASH","CLICK","COUPON"].includes(input.method)) throw new ReceivableError("INVALID_INPUT", "تحقق من قيمة التسديد.");
  const db = getFirebaseAdminFirestore(), debtRef = db.collection("customerReceivables").doc(input.receivableId), orderRef = db.collection("deliveryOrders").doc(input.receivableId.slice(6)), receiptRef = db.collection("receivableCollections").doc(input.requestId);
  const fingerprint = createHash("sha256").update(JSON.stringify([input.customerId, input.receivableId, input.amount, input.method])).digest("hex");
  return db.runTransaction(async tx => {
    const existing = await tx.get(receiptRef);
    if (existing.exists) { if (existing.data()?.fingerprint !== fingerprint) throw new ReceivableError("REQUEST_CONFLICT", "طلب التسجيل مستخدم لبيانات مختلفة."); return { unchanged: true }; }
    const [debtDoc, orderDoc] = await Promise.all([tx.get(debtRef), tx.get(orderRef)]);
    const order = orderDoc.data(), now = Timestamp.now();
    if (!order || order.customerId !== input.customerId || order.status !== "DELIVERED") throw new ReceivableError("NOT_FOUND", "المستحق غير متاح لهذا العميل.");
    const debt = debtDoc.data() ?? (order.paymentMethod === "COUPON" ? receivableFromOrder(orderRef.id, order, order.deliveredAt ?? now, "COUPON", unsigned(order.pendingCouponQuantity ?? 0)) : null);
    if (!debt || !["MONEY","COUPON"].includes(debt.kind) || debt.customerId !== input.customerId || debt.orderId !== orderRef.id || debt.storeAuthUid !== order.storeAuthUid || unsigned(debt.outstanding) < input.amount || unsigned(debt.original) !== unsigned(debt.outstanding) + unsigned(debt.settled)) throw new ReceivableError("INVALID_BALANCE", "قيمة التسديد تتجاوز المستحق أو أن الرصيد تغيّر.");
    if ((debt.kind === "COUPON") !== (input.method === "COUPON")) throw new ReceivableError("INVALID_METHOD", "اختر طريقة تسديد مطابقة لنوع المستحق.");
    if (debt.kind === "COUPON" ? unsigned(order.pendingCouponQuantity ?? 0) !== debt.outstanding : (unsigned(order.totalFils) !== debt.original || unsigned(order.collectedFils ?? 0) + debt.outstanding !== debt.original || order.collectionMode !== "RECEIPTS")) throw new ReceivableError("INVALID_BALANCE", "رصيد الطلب والمستحق غير متطابقين.");
    const allocations: Array<{ id: string; quantity: number; remaining: number }> = [];
    let shiftRef: FirebaseFirestore.DocumentReference | null = null;
    let shift: FirebaseFirestore.DocumentData | undefined;
    let times = DEFAULT_SHIFT_TIMES;
    if (input.method === "COUPON") {
      const books = await tx.get(db.collection("couponBooklets").where("customerId", "==", input.customerId).limit(LIMIT+1));
      if (books.size > LIMIT) throw new ReceivableError("TOO_MANY_BOOKLETS", "عدد دفاتر العميل يتجاوز الحد المتاح للتسوية. راجع سجله أولًا.");
      let needed = input.amount;
      for (const doc of [...books.docs].sort((a, b) => {
        const time=(data:FirebaseFirestore.DocumentData)=>{const at=data.activatedAt??data.createdAt;return at instanceof Timestamp?at.toMillis():0;};
        return time(a.data())-time(b.data())||a.id.localeCompare(b.id);
      })) {
        const b = doc.data(); if (b.status !== "ACTIVE") continue;
        const remaining = unsigned(b.remainingCoupons), reserved = unsigned(b.reservedCoupons);
        if (remaining > 22 || reserved > remaining) throw new ReceivableError("INVALID_BALANCE", "رصيد الدفتر غير متسق.");
        const take = Math.min(remaining - reserved, needed);
        if (take) allocations.push({ id: doc.id, quantity: take, remaining: remaining - take });
        needed -= take; if (!needed) break;
      }
      if (needed) throw new ReceivableError("COUPONS_INSUFFICIENT", "الكوبونات المتاحة لا تكفي للتسديد. أضف دفترًا للعميل أو خفّض عدد التسديد.");
    } else {
      const [index, settings] = await Promise.all([tx.get(db.collection("activeStoreShifts").doc(getActiveStoreShiftDocumentId(order.storeAuthUid))), tx.get(db.collection("systemSettings").doc("employeeShiftTimes"))]);
      times = (settings.data() ?? DEFAULT_SHIFT_TIMES) as EmployeeShiftTimeSettings;
      const id = index.data()?.shiftId;
      if (typeof id === "string") {
        const ref = db.collection("shifts").doc(id), doc = await tx.get(ref);
        if (doc.data()?.status === "OPEN" && doc.data()?.storeAuthUid === order.storeAuthUid) { shiftRef = ref; shift = doc.data(); }
      }
    }
    // All balance, booklet and shift reads precede every write.
    const outstanding = debt.outstanding - input.amount;
    const financial = shift?.shiftTimeSnapshot ?? shiftTimeSnapshot(now.toDate(), times);
    tx.set(debtRef, { ...debt, outstanding, settled: debt.settled + input.amount, status: outstanding ? "OPEN" : "SETTLED", updatedAt: now, lastSettledByAdminUid: input.adminUid });
    tx.create(receiptRef, { customerId: input.customerId, orderId: orderRef.id, orderNumber: order.orderNumber, receivableId: debtRef.id, storeAuthUid: order.storeAuthUid, amount: input.amount, method: input.method, kind: debt.kind, fingerprint, receivedAt: now, recordedByAdminUid: input.adminUid, shiftId: shiftRef?.id ?? null, financialAt: shift?.openedAt ?? now, financialDate: financial.workDay, financialPeriod: financial.shiftType });
    if (input.method === "COUPON") {
      for (const row of allocations) {
        tx.update(db.collection("couponBooklets").doc(row.id), { remainingCoupons: row.remaining, ...(row.remaining === 0 ? { status: "EXHAUSTED" } : {}), updatedAt: now });
        tx.create(db.collection("couponBookletTransactions").doc(`DEBT_${input.requestId}_${row.id}`), { type: "ORDER_DEBIT", bookletId: row.id, customerId: input.customerId, orderId: orderRef.id, quantity: row.quantity, adminUid: input.adminUid, receiptId: input.requestId, createdAt: now });
      }
      tx.update(orderRef, { pendingCouponQuantity: outstanding, paymentState: outstanding ? "AWAITING_BOOKLET_APPROVAL" : "COUPONS_SETTLED", updatedAt: now });
    } else {
      tx.update(orderRef, { collectedFils: debt.original - outstanding, collectedAt: now, paymentState: outstanding ? "PARTIALLY_COLLECTED" : "COLLECTED", collectionMode: "RECEIPTS", updatedAt: now });
      if (shiftRef) tx.update(shiftRef, { cashSalesFils: FieldValue.increment(input.method === "CASH" ? input.amount : 0), clickSalesFils: FieldValue.increment(input.method === "CLICK" ? input.amount : 0), receivableCollectionsFils: FieldValue.increment(input.amount), updatedAt: now });
    }
    return { unchanged: false, outstanding };
  });
}
