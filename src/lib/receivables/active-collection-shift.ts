import "server-only";
import type { Firestore,Transaction } from "firebase-admin/firestore";
import { getActiveStoreShiftDocumentId } from "@/lib/shifts/shift-repository";
import { ReceivableError } from "./records";
export async function activeCollectionShift(tx:Transaction,db:Firestore,storeAuthUid?:string){
  const indices=storeAuthUid?[await tx.get(db.collection("activeStoreShifts").doc(getActiveStoreShiftDocumentId(storeAuthUid)))]:((await tx.get(db.collection("activeStoreShifts").limit(3))).docs);
  const ids=[...new Set(indices.map(d=>d.data()?.shiftId).filter((id):id is string=>typeof id==="string"&&/^[A-Za-z0-9_-]{1,150}$/.test(id)))];
  const docs=await Promise.all(ids.map(id=>tx.get(db.collection("shifts").doc(id))));
  const active=docs.filter(doc=>doc.data()?.status==="OPEN"&&typeof doc.data()?.storeAuthUid==="string"&&(!storeAuthUid||doc.data()?.storeAuthUid===storeAuthUid));
  if(active.length>1)throw new ReceivableError("AMBIGUOUS_SHIFT","يوجد أكثر من شفت مفتوح. أغلق الشفت الزائد قبل تسجيل التحصيل.");
  return active.length?{ref:active[0].ref,data:active[0].data()!}:null;
}
