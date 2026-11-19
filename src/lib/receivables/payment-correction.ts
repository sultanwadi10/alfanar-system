import "server-only";
import { FieldValue,Timestamp } from "firebase-admin/firestore";
import { getFirebaseAdminFirestore } from "@/lib/firebase/admin";
import { getActiveStoreShiftDocumentId } from "@/lib/shifts/shift-repository";
import { deliveryPaymentPlan,orderMoneyMethod } from "@/lib/orders/payment-plan";
import { ReceivableError,unsigned } from "./records";
// A correction is a new audited operation. Closed shifts and their original
// receipts stay intact; cash differences belong to the currently open shift.
export async function correctOrderPayment(input:{customerId:string;orderId:string;requestId:string;method:"CASH"|"CLICK"|"COUPON";remainderMethod:"CASH"|"CLICK";expectedMoneyDueFils:number;expectedCouponQuantity:number;adminUid:string}){
  const db=getFirebaseAdminFirestore(),orderRef=db.collection("deliveryOrders").doc(input.orderId),opRef=db.collection("paymentCorrections").doc(input.requestId);
  const fingerprint=JSON.stringify([input.customerId,input.orderId,input.method,input.remainderMethod]);
  return db.runTransaction(async tx=>{
    const op=await tx.get(opRef);if(op.exists){if(op.data()?.fingerprint!==fingerprint)throw new ReceivableError("CONFLICT","معرّف التصحيح مستخدم لعملية أخرى.");return {unchanged:true};}
    const orderDoc=await tx.get(orderRef),order=orderDoc.data();
    if(!order||order.customerId!==input.customerId||order.status!=="DELIVERED")throw new ReceivableError("NOT_FOUND","التصحيح متاح لطلب مسلم لهذا العميل.");
    const [books,logs,receipts,index]=await Promise.all([
      tx.get(db.collection("couponBooklets").where("customerId","==",input.customerId)),
      tx.get(db.collection("couponBookletTransactions").where("orderId","==",input.orderId)),
      tx.get(db.collection("receivableCollections").where("orderId","==",input.orderId)),
      tx.get(db.collection("activeStoreShifts").doc(getActiveStoreShiftDocumentId(order.storeAuthUid))),
    ]);
    const activeId=index.data()?.shiftId;
    if(typeof activeId!=="string")throw new ReceivableError("NO_SHIFT","افتح شفتًا لتسجيل الأثر النقدي للتصحيح.");
    const shiftRef=db.collection("shifts").doc(activeId),shiftDoc=await tx.get(shiftRef),shift=shiftDoc.data();
    if(shift?.status!=="OPEN"||shift.storeAuthUid!==order.storeAuthUid)throw new ReceivableError("NO_SHIFT","يلزم شفت مفتوح للتصحيح.");
    const since=order.lastPaymentCorrectionAt instanceof Timestamp?order.lastPaymentCorrectionAt.toMillis():-1;
    const refunded=new Map<string,number>();
    for(const log of logs.docs){const v=log.data();if(v.type==="ORDER_DEBIT"&&v.createdAt instanceof Timestamp&&v.createdAt.toMillis()>=since)refunded.set(v.bookletId,(refunded.get(v.bookletId)??0)+unsigned(v.quantity));}
    const wallet=books.docs.map(doc=>{const b=doc.data(),remaining=unsigned(b.remainingCoupons)+(refunded.get(doc.id)??0),reserved=unsigned(b.reservedCoupons??0);if(remaining>22||reserved>remaining)throw new ReceivableError("INVALID_BALANCE","رصيد الدفتر غير متسق.");return {id:doc.id,b,remaining,reserved,take:0};});
    if([...refunded.keys()].some(id=>!wallet.some(b=>b.id===id)))throw new ReceivableError("INVALID_BALANCE","دفتر الكوبونات الأصلي غير موجود.");
    wallet.sort((a,b)=>(a.b.activatedAt?.toMillis?.()??0)-(b.b.activatedAt?.toMillis?.()??0)||a.id.localeCompare(b.id));
    const available=wallet.reduce((n,w)=>n+(["ACTIVE","EXHAUSTED"].includes(w.b.status)?w.remaining-w.reserved:0),0);
    const payment=deliveryPaymentPlan(order.items,available,input.method==="COUPON");
    if(payment.moneyDueFils!==input.expectedMoneyDueFils||payment.couponQuantity!==input.expectedCouponQuantity)throw new ReceivableError("BALANCE_CHANGED","تغير رصيد العميل. حدّث الصفحة وراجع توزيع الدفع قبل التصحيح.");
    let need=payment.couponQuantity;
    for(const w of wallet){if(!["ACTIVE","EXHAUSTED"].includes(w.b.status))continue;w.take=Math.min(need,w.remaining-w.reserved);need-=w.take;}
    let oldCash=0,oldClick=0;
    const effectiveMethod=orderMoneyMethod(order as {paymentMethod:string});
    if(order.collectionMode!=="RECEIPTS"&&order.paymentState==="COLLECTED"){
      if(effectiveMethod==="CASH")oldCash+=unsigned(order.collectedFils??order.totalFils);else if(effectiveMethod==="CLICK")oldClick+=unsigned(order.collectedFils??order.totalFils);
    }
    for(const receipt of receipts.docs){const r=receipt.data();if(r.kind!=="MONEY")continue;const amount=unsigned(r.amount)*(r.direction===-1?-1:1);if(r.method==="CASH")oldCash+=amount;else if(r.method==="CLICK")oldClick+=amount;}
    if(oldCash<0||oldClick<0)throw new ReceivableError("INVALID_BALANCE","التحصيلات غير متسقة.");
    const newMethod=input.method==="COUPON"?input.remainderMethod:input.method;
    const newCash=newMethod==="CASH"?payment.moneyDueFils:0,newClick=newMethod==="CLICK"?payment.moneyDueFils:0,now=Timestamp.now();
    const common={customerId:input.customerId,orderId:input.orderId,orderNumber:order.orderNumber,storeAuthUid:order.storeAuthUid,kind:"MONEY",receivedAt:now,recordedByAdminUid:input.adminUid,shiftId:activeId,correctionId:input.requestId,financialAt:shift.openedAt,financialDate:shift.shiftTimeSnapshot?.workDay??"",financialPeriod:shift.shiftTimeSnapshot?.shiftType??"OTHER"};
    // Preserve the original delivery collection as a receipt at its actual time.
    if(order.collectionMode!=="RECEIPTS"&&order.paymentState==="COLLECTED"&&unsigned(order.collectedFils??order.totalFils)>0)tx.create(db.collection("receivableCollections").doc(`ORIGINAL_${input.orderId}`),{...common,amount:unsigned(order.collectedFils??order.totalFils),method:effectiveMethod,direction:1,receivedAt:order.collectedAt??order.deliveredAt,shiftId:order.deliveredShiftId??order.shiftId??null,originalSnapshot:true});
    for(const [method,oldAmount,newAmount] of [["CASH",oldCash,newCash],["CLICK",oldClick,newClick]] as const){
      if(oldAmount)tx.create(db.collection("receivableCollections").doc(`${input.requestId}_${method}_REVERSE`),{...common,method,amount:oldAmount,direction:-1});
      if(newAmount)tx.create(db.collection("receivableCollections").doc(`${input.requestId}_${method}_NEW`),{...common,method,amount:newAmount,direction:1});
    }
    for(const w of wallet){const refund=refunded.get(w.id)??0;if(!refund&&!w.take)continue;const remaining=w.remaining-w.take;tx.update(db.collection("couponBooklets").doc(w.id),{remainingCoupons:remaining,status:remaining===0?"EXHAUSTED":w.b.status==="EXHAUSTED"?"ACTIVE":w.b.status,updatedAt:now});if(refund)tx.create(db.collection("couponBookletTransactions").doc(`${input.requestId}_${w.id}_RETURN`),{type:"PAYMENT_CORRECTION_RETURN",bookletId:w.id,orderId:input.orderId,customerId:input.customerId,quantity:refund,adminUid:input.adminUid,createdAt:now});if(w.take)tx.create(db.collection("couponBookletTransactions").doc(`${input.requestId}_${w.id}_DEBIT`),{type:"ORDER_DEBIT",bookletId:w.id,orderId:input.orderId,customerId:input.customerId,quantity:w.take,adminUid:input.adminUid,createdAt:now});}
    tx.update(shiftRef,{cashSalesFils:FieldValue.increment(newCash-oldCash),clickSalesFils:FieldValue.increment(newClick-oldClick),updatedAt:now});
    tx.update(orderRef,{paymentMethod:input.method,remainderMethod:input.remainderMethod,moneyDueFils:payment.moneyDueFils,couponValueFils:payment.couponValueFils,couponQuantity:payment.couponQuantity,pendingCouponQuantity:0,couponAllocations:wallet.filter(w=>w.take).map(w=>({bookletId:w.id,quantity:w.take})),paymentState:payment.moneyDueFils?"COLLECTED":"COUPONS_SETTLED",collectedFils:payment.moneyDueFils,collectionMode:"RECEIPTS",lastPaymentCorrectionAt:now,updatedAt:now,paymentVersion:2});
    tx.set(db.collection("customerReceivables").doc(`order_${input.orderId}`),{customerId:input.customerId,customerName:order.customerNameSnapshot,storeAuthUid:order.storeAuthUid,orderId:input.orderId,orderNumber:order.orderNumber,kind:"MONEY",original:payment.moneyDueFils,settled:payment.moneyDueFils,outstanding:0,status:"SETTLED",createdAt:order.deliveredAt,updatedAt:now,expectedMethod:newMethod});
    tx.create(opRef,{...input,fingerprint,before:{method:order.paymentMethod,cash:oldCash,click:oldClick},after:{method:input.method,cash:newCash,click:newClick,coupons:payment.couponQuantity},createdAt:now});
    return {unchanged:false,...payment};
  });
}
