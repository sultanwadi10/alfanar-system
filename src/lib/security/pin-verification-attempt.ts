import "server-only";
import { createHash,randomUUID } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { getFirebaseAdminFirestore } from "@/lib/firebase/admin";
import { OPERATOR_SESSION_CONFIG } from "@/lib/auth/operator-session-config";
// Reserve a bounded verification slot BEFORE expensive scrypt, including concurrent requests.
export async function reservePinVerification(storeAuthUid:string,employeeId:string){
 const db=getFirebaseAdminFirestore(),ref=db.collection("employeePinAttempts").doc(createHash("sha256").update(storeAuthUid+":"+employeeId).digest("hex")),attemptId=randomUUID();
 return db.runTransaction(async tx=>{
  const snapshot=await tx.get(ref),data=snapshot.data(),now=Date.now(),until=data?.lockedUntil;
  if(until instanceof Timestamp&&until.toMillis()>now)return {allowed:false,locked:true,attemptId};
  const expired=until instanceof Timestamp&&until.toMillis()<=now;
  const count=(expired?0:Number.isSafeInteger(data?.failedAttempts)?data!.failedAttempts:0)+1;
  const locked=count>=OPERATOR_SESSION_CONFIG.MAX_PIN_ATTEMPTS;
  tx.set(ref,{failedAttempts:count,lockedUntil:locked?Timestamp.fromMillis(now+OPERATOR_SESSION_CONFIG.PIN_LOCK_MS):null,updatedAt:Timestamp.fromMillis(now),attemptId});
  return {allowed:true,locked,attemptId};
 });
}
export async function clearSuccessfulPinVerification(storeAuthUid:string,employeeId:string,attemptId:string){
 const db=getFirebaseAdminFirestore(),ref=db.collection("employeePinAttempts").doc(createHash("sha256").update(storeAuthUid+":"+employeeId).digest("hex"));
 await db.runTransaction(async tx=>{const snapshot=await tx.get(ref);if(snapshot.data()?.attemptId===attemptId)tx.delete(ref);});
}
