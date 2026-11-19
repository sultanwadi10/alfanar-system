import "server-only";
import { createHash } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { getFirebaseAdminFirestore } from "@/lib/firebase/admin";
import { ReceivableError } from "./records";
export async function createManualDebt(input:{requestId:string;customerId:string;amount:number;adminUid:string}){
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId)||!/^[A-Za-z0-9_-]{1,128}$/.test(input.customerId)||!Number.isSafeInteger(input.amount)||input.amount<1||input.amount>100_000_000)throw new ReceivableError("INVALID_INPUT","اختر العميل وأدخل مبلغًا صحيحًا.");
  const db=getFirebaseAdminFirestore(),ref=db.collection("customerReceivables").doc("manual_"+input.requestId),customerRef=db.collection("customers").doc(input.customerId);
  const fingerprint=createHash("sha256").update(JSON.stringify([input.customerId,input.amount])).digest("hex");
  return db.runTransaction(async tx=>{
    const [existing,customer]=await Promise.all([tx.get(ref),tx.get(customerRef)]);
    if(existing.exists){if(existing.data()?.fingerprint!==fingerprint)throw new ReceivableError("REQUEST_CONFLICT","طلب التسجيل مستخدم لبيانات مختلفة.");return {id:ref.id,unchanged:true};}
    if(!customer.exists||customer.data()?.isArchived)throw new ReceivableError("NOT_FOUND","العميل غير متاح.");
    const now=Timestamp.now();
    tx.create(ref,{source:"MANUAL",customerId:input.customerId,customerName:String(customer.data()!.name),storeAuthUid:null,orderId:null,orderNumber:null,kind:"MONEY",status:"OPEN",original:input.amount,outstanding:input.amount,settled:0,createdAt:now,updatedAt:now,recordedByAdminUid:input.adminUid,fingerprint});
    return {id:ref.id,unchanged:false};
  });
}
