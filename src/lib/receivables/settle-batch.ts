import "server-only";
import { createHash } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getFirebaseAdminFirestore } from "@/lib/firebase/admin";
import { activeCollectionShift } from "./active-collection-shift";
import { currentRosterTimes } from "@/lib/employees/roster-repository";
import { shiftTimeSnapshot } from "@/lib/shifts/shift-payroll";
import { ReceivableError, unsigned } from "./records";
import { settlementPlan, SETTLEMENT_LIMIT,receivableIdPattern } from "./settlement-plan";

export type SettlementBatch = { requestId: string; customerId: string; amount: number; method: "CASH" | "CLICK"; items: { receivableId: string; expectedOutstanding: number }[]; adminUid: string };
export async function settleReceivablesBatch(input: SettlementBatch) {
  if (!/^[A-Za-z0-9_-]{1,150}$/.test(input.customerId) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId) || !["CASH", "CLICK"].includes(input.method) || !input.items.length || input.items.length > SETTLEMENT_LIMIT || input.items.some(i => !receivableIdPattern.test(i.receivableId))) throw new ReceivableError("INVALID_INPUT", "تحقق من بيانات التسديد.");
  const items = [...input.items].sort((a,b) => a.receivableId.localeCompare(b.receivableId));
  try { settlementPlan(items.map(i => ({ id:i.receivableId, outstanding:i.expectedOutstanding })), input.amount); } catch (e) { throw new ReceivableError("INVALID_INPUT", (e as Error).message); }
  const db = getFirebaseAdminFirestore(), operation = db.collection("receivableBatches").doc(input.requestId);
  const fingerprint = createHash("sha256").update(JSON.stringify([input.customerId,input.method,input.amount,items])).digest("hex");
  return db.runTransaction(async tx => {
    const previous = await tx.get(operation);
    if (previous.exists) { if (previous.data()!.fingerprint !== fingerprint) throw new ReceivableError("REQUEST_CONFLICT", "طلب التسديد مستخدم لبيانات مختلفة."); return previous.data()!.result; }
    const docs = await Promise.all(items.map(async item => {
      const manual=item.receivableId.startsWith("manual_"),debtRef = db.collection("customerReceivables").doc(item.receivableId), orderRef = manual?null:db.collection("deliveryOrders").doc(item.receivableId.slice(6));
      const [debtDoc, orderDoc] = await Promise.all([tx.get(debtRef),orderRef?tx.get(orderRef):Promise.resolve(null)]);
      const debt = debtDoc.data(), order = orderDoc?.data();
      if (!debt || debt.customerId!==input.customerId || debt.kind!=="MONEY" || (manual?(debt.source!=="MANUAL"||debt.orderId!==null||debt.storeAuthUid!==null):(!order||order.customerId!==input.customerId||order.status!=="DELIVERED"||debt.orderId!==orderRef!.id||debt.storeAuthUid!==order.storeAuthUid))) throw new ReceivableError("NOT_FOUND", "أحد المستحقات المحددة لم يعد متاحًا.");
      if (unsigned(debt.outstanding) !== item.expectedOutstanding || unsigned(debt.original) !== unsigned(debt.settled)+unsigned(debt.outstanding) || (!manual&&(!order||unsigned(order.moneyDueFils??order.totalFils)!==debt.original||unsigned(order.collectedFils??0)+debt.outstanding!==debt.original||order.collectionMode!=="RECEIPTS"))) throw new ReceivableError("BALANCE_CHANGED", "تغير رصيد أحد الطلبات. حدّث المستحقات وأعد التسديد.");
      return { id:debtRef.id, outstanding:debt.outstanding as number, debtRef, orderRef, debt, order };
    }));
    docs.sort((a,b) => (a.debt.createdAt instanceof Timestamp?a.debt.createdAt.toMillis():0)-(b.debt.createdAt instanceof Timestamp?b.debt.createdAt.toMillis():0)||a.id.localeCompare(b.id));
    const plan = settlementPlan(docs,input.amount), now = Timestamp.now();
    const times = await currentRosterTimes(tx,db,now.toDate());
    const stores = new Map<string,{ref:FirebaseFirestore.DocumentReference;data:FirebaseFirestore.DocumentData}|null>();
    await Promise.all([...new Set(docs.map(d => d.order?.storeAuthUid??"MANUAL"))].map(async uid => {
      const active=await activeCollectionShift(tx,db,uid==="MANUAL"?undefined:uid);
      if(!active)throw new ReceivableError("NO_SHIFT","افتح شفتًا قبل تسجيل المبلغ المقبوض.");
      stores.set(uid,active);
    }));
    const shifts = new Map<string,{ref:FirebaseFirestore.DocumentReference;amount:number}>();
    for (const line of plan) {
      const row=docs.find(d=>d.id===line.id)!, active=stores.get(row.order?.storeAuthUid??"MANUAL")!, financial=active!.data.shiftTimeSnapshot??shiftTimeSnapshot(now.toDate(),times);
      tx.update(row.debtRef,{outstanding:line.outstanding,settled:row.debt.settled+line.amount,status:line.outstanding?"OPEN":"SETTLED",updatedAt:now,lastSettledByAdminUid:input.adminUid});
      if(row.orderRef)tx.update(row.orderRef,{collectedFils:row.debt.original-line.outstanding,collectedAt:now,paymentState:line.outstanding?"PARTIALLY_COLLECTED":"COLLECTED",collectionMode:"RECEIPTS",updatedAt:now});
      tx.create(db.collection("receivableCollections").doc(`${input.requestId}_${line.id}`),{source:row.debt.source??"ORDER",channel:row.orderRef?"DELIVERY":"STORE",batchId:input.requestId,customerId:input.customerId,orderId:row.orderRef?.id??null,orderNumber:row.order?.orderNumber??null,receivableId:line.id,storeAuthUid:active!.data.storeAuthUid,amount:line.amount,method:input.method,kind:"MONEY",fingerprint,receivedAt:now,recordedByAdminUid:input.adminUid,shiftId:active!.ref.id,financialAt:active!.data.openedAt,financialDate:financial.workDay,financialPeriod:financial.shiftType});
      if (active) { const sum=shifts.get(active.ref.id)??{ref:active.ref,amount:0};sum.amount+=line.amount;shifts.set(active.ref.id,sum); }
    }
    for (const shift of shifts.values()) tx.update(shift.ref,{[input.method==="CASH"?"cashSalesFils":"clickSalesFils"]:FieldValue.increment(shift.amount),totalSalesFils:FieldValue.increment(shift.amount),receivableCollectionsFils:FieldValue.increment(shift.amount),updatedAt:now});
    const result={amount:input.amount,orders:plan.length};tx.create(operation,{fingerprint,customerId:input.customerId,result,createdAt:now,adminUid:input.adminUid});return result;
  });
}
