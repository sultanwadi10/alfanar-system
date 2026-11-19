import "server-only";
import { Timestamp, type Firestore, type Transaction } from "firebase-admin/firestore";
import { getFirebaseAdminFirestore } from "@/lib/firebase/admin";
import { InventoryError } from "@/lib/inventory/stock-engine";
import { privateBottlePlan,type PrivateBottleOwnership,type PrivateBottleLine } from "./private-bottle-plan";
export type PrivateBottleRow = PrivateBottleOwnership;

function readRows(value: unknown): PrivateBottleRow[] {
  if(!Array.isArray(value))throw new InventoryError("PRIVATE_BOTTLES_INVALID","بيانات القوارير الخاصة غير صالحة.");
  // Ignore legacy atStore values; existing profiles need no receiving step.
  const rows=value.map(row=>({origin:row.origin,sizeMl:row.sizeMl,owned:row.owned,reserved:row.reserved??0})) as PrivateBottleRow[];
  const keys=new Set<string>();
  for(const row of rows){
    const key=`${row.origin}:${row.sizeMl}`;
    if(keys.has(key)||!["JORDANIAN","SAUDI"].includes(row.origin)||![row.sizeMl,row.owned,row.reserved].every(n=>Number.isSafeInteger(n)&&n>=0&&n<=100000)||row.sizeMl<1||row.reserved>row.owned)throw new InventoryError("PRIVATE_BOTTLES_INVALID","تحقق من عدد القوارير المملوكة؛ لا يجوز تقليله عن العدد المستخدم بطلبات قائمة.");
    keys.add(key);
  }
  return rows;
}
export async function getPrivateBottles(customerId:string){
  const doc=await getFirebaseAdminFirestore().collection("customerPrivateBottles").doc(customerId).get();
  return readRows(doc.data()?.rows??[]);
}
export async function savePrivateBottles(customerId:string,rows:Omit<PrivateBottleRow,"reserved">[],adminUid:string){
  const db=getFirebaseAdminFirestore(),ref=db.collection("customerPrivateBottles").doc(customerId);
  return db.runTransaction(async tx=>{
    const [doc,customer]=await Promise.all([tx.get(ref),tx.get(db.collection("customers").doc(customerId))]);
    if(!customer.exists)throw new InventoryError("NOT_FOUND","العميل غير موجود.");
    const before=readRows(doc.data()?.rows??[]);
    const next=readRows(rows.map(row=>({...row,reserved:before.find(r=>r.origin===row.origin&&r.sizeMl===row.sizeMl)?.reserved??0})));
    if(before.some(row=>row.reserved>0&&!next.some(next=>next.origin===row.origin&&next.sizeMl===row.sizeMl)))throw new InventoryError("PRIVATE_BOTTLES_RESERVED","لا يمكن إزالة نوع مستخدم بطلب قائم.");
    const now=Timestamp.now();
    tx.set(ref,{version:2,rows:next,updatedAt:now,updatedByAdminUid:adminUid});
    tx.create(db.collection("privateBottleMovements").doc(),{customerId,before,after:next,adminUid,createdAt:now,type:"ADJUST"});
    return next;
  });
}
type Line=PrivateBottleLine & {personalBottleQuantity?:number;storeBottleShortageConfirmed?:boolean;expectedPrivateBottleQuantity?:number};
export async function preparePrivateBottles(tx:Transaction,db:Firestore,customerId:string,lines:Line[],action:"RESERVE"|"DELIVERED"|"CANCELLED",orderId:string,actorId:string){
  if(action!=="RESERVE"&&!lines.some(line=>(line.personalBottleQuantity??0)>0))return {commit(){}};
  const ref=db.collection("customerPrivateBottles").doc(customerId),doc=await tx.get(ref);
  const before=readRows(doc.data()?.rows??[]),rows=before.map(row=>({...row}));
  if(action==="RESERVE"){
    const plan=privateBottlePlan(lines,rows);
    plan.forEach((usage,index)=>{
      if(lines[index].expectedPrivateBottleQuantity!==undefined&&lines[index].expectedPrivateBottleQuantity!==usage.personalBottleQuantity)throw new InventoryError("PRIVATE_BOTTLES_CHANGED","تغيرت بيانات القوارير الخاصة أو حجز طلب آخر بعضها. حدّث بيانات العميل وراجع الكمية قبل التأكيد.");
      if(usage.shortage>0&&!lines[index].storeBottleShortageConfirmed)throw new InventoryError("PRIVATE_BOTTLES_SHORTAGE","عدد قوارير العميل الخاصة لا يكفي أو بعضها ضمن طلب قائم. راجع الكمية وأكد تغطية الباقي من قوارير المحل.");
      lines[index].personalBottleQuantity=usage.personalBottleQuantity;
    });
  }
  let changed=false;
  for(const line of lines){
    const n=line.personalBottleQuantity??0;if(!n)continue;
    if(!Number.isSafeInteger(n)||n<1||n>line.quantity||line.category!=="REFILL")throw new InventoryError("PRIVATE_BOTTLES_INVALID","كمية القوارير الخاصة غير صالحة.");
    const row=rows.find(row=>row.origin===line.bottleOrigin&&row.sizeMl===line.bottleSizeMl);
    if(!row||action!=="RESERVE"&&row.reserved<n)throw new InventoryError("PRIVATE_BOTTLES_INVALID","حجز قوارير العميل غير متسق.");
    row.reserved+=action==="RESERVE"?n:-n;changed=true;
  }
  readRows(rows);
  return {commit(){if(!changed)return;const now=Timestamp.now();tx.set(ref,{version:2,rows,updatedAt:now});tx.create(db.collection("privateBottleMovements").doc(`${orderId}_${action}`),{customerId,orderId,actorId,type:action,before,after:rows,createdAt:now});}};
}
