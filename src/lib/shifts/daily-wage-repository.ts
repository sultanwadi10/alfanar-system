import "server-only";
import { createHash } from "node:crypto";
import { Timestamp,type Firestore,type Transaction } from "firebase-admin/firestore";
import { DEFAULT_SHIFT_TIMES,recordedShiftWage,shiftTimeSnapshot,validWage,type WageSettlementStatus } from "./shift-payroll";

type WageShift={openedAt:Timestamp;wageWorkDay?:string;shiftTimeSnapshot?:ReturnType<typeof shiftTimeSnapshot>;wageFilsSnapshot?:number|null};
export const DAILY_WAGE_RECEIPTS="employeeDailyWages";
const CUTOVERS="employeePayrollCutovers";
const hash=(parts:string[])=>createHash("sha256").update(JSON.stringify(parts)).digest("hex");
export const dailyWageReceiptId=(storeAuthUid:string,employeeId:string,day:string)=>hash([storeAuthUid,employeeId,day]);
function validDay(value:unknown):value is string{
 return typeof value==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+"T12:00:00Z"))&&new Date(value+"T12:00:00Z").toISOString().slice(0,10)===value;
}
export function wageWorkDay(shift:WageShift):string{
 const day=shift.wageWorkDay??shift.shiftTimeSnapshot?.workDay;
 if(day!==undefined){
  if(!validDay(day)||(shift.wageWorkDay&&shift.shiftTimeSnapshot?.workDay&&shift.wageWorkDay!==shift.shiftTimeSnapshot.workDay))throw Error("Invalid wage work day");
  return day;
 }
 if(!(shift.openedAt instanceof Timestamp))throw Error("Missing wage opening timestamp");
 return shiftTimeSnapshot(shift.openedAt.toDate(),shift.shiftTimeSnapshot?.times??DEFAULT_SHIFT_TIMES).workDay;
}

// Reads are completed before commit() so cash, day receipt and shift close stay atomic.
export async function prepareDailyWage(tx:Transaction,db:Firestore,shift:WageShift,actor:{storeAuthUid:string;employeeId:string;employeeName:string;shiftId:string},now:Timestamp){
 const day=wageWorkDay(shift),rate=shift.wageFilsSnapshot??null;
 if(rate!==null&&!validWage(rate))throw Error("Invalid wage configuration");
 const receiptRef=db.collection(DAILY_WAGE_RECEIPTS).doc(dailyWageReceiptId(actor.storeAuthUid,actor.employeeId,day));
 const cutoverRef=db.collection(CUTOVERS).doc(hash([actor.storeAuthUid,actor.employeeId]));
 const [receipt,cutover]=await Promise.all([tx.get(receiptRef),tx.get(cutoverRef)]);
 const cutoff=cutover.data();
 if(cutover.exists&&(!cutoff||cutoff.storeAuthUid!==actor.storeAuthUid||cutoff.employeeId!==actor.employeeId||!validDay(cutoff.legacyThroughDay)))throw Error("Invalid payroll cutover");
 if(receipt.exists){
  const value=receipt.data();
  if(!value||value.storeAuthUid!==actor.storeAuthUid||value.employeeId!==actor.employeeId||value.workDay!==day||value.status!=="SETTLED"||!Number.isSafeInteger(value.paidFils)||value.paidFils<0)throw Error("Invalid daily wage receipt");
 }
 let previous:Array<{id:string;amount:number;at:Timestamp}>=[];
 if(!receipt.exists){
  const legacy=!cutover.exists||day<=cutoff!.legacyThroughDay;
  let query=db.collection("shifts").where("storeAuthUid","==",actor.storeAuthUid).where("openedByEmployeeId","==",actor.employeeId).where("status","==","CLOSED");
  // The full legacy scan is only needed at cutover or for old work days.
  if(!legacy)query=query.where("wageWorkDay","==",day);
  const history=await tx.get(query.limit(5001));
  if(history.size>5000)throw Error("Payroll history needs review before another daily payment");
  for(const document of history.docs){
   const value=document.data();
   if(wageWorkDay(value as WageShift)!==day||value.wageSettlement==="ALREADY_PAID")continue;
   let amount=recordedShiftWage(value);
   // Positive legacy payment evidence still prevents a second payment if its rate snapshot is missing.
   if(amount===null&&value.payrollVersion!==2&&validWage(value.wagePaidFils)&&value.wagePaidFils>0)amount=value.wagePaidFils;
   if(amount===null)continue;
   if(!(value.closedAt instanceof Timestamp))throw Error("Missing historical wage receipt timestamp");
   previous.push({id:document.id,amount,at:value.closedAt});
  }
  previous=previous.sort((a,b)=>a.at.toMillis()-b.at.toMillis()||a.id.localeCompare(b.id));
 }
 const alreadyPaid=receipt.exists||previous.length>0;
 const paidFils=alreadyPaid?0:rate??0;
 const status:WageSettlementStatus=alreadyPaid?"ALREADY_PAID":rate===null?"UNCONFIGURED":"PAID";
 const oldTotal=previous.reduce((sum,row)=>sum+row.amount,0);
 if(!Number.isSafeInteger(oldTotal))throw Error("Invalid historical wage total");
 const today=shiftTimeSnapshot(now.toDate(),DEFAULT_SHIFT_TIMES).workDay;
 return {paidFils,status,workDay:day,receiptId:status==="UNCONFIGURED"?null:receiptRef.id,commit(){
  if(!cutover.exists)tx.create(cutoverRef,{storeAuthUid:actor.storeAuthUid,employeeId:actor.employeeId,legacyThroughDay:today,createdAt:now});
  if(!receipt.exists&&status!=="UNCONFIGURED")tx.create(receiptRef,{
   storeAuthUid:actor.storeAuthUid,employeeId:actor.employeeId,employeeNameSnapshot:actor.employeeName,workDay:day,status:"SETTLED",
   paidFils:previous.length?oldTotal:paidFils,source:previous.length?"LEGACY_IMPORT":"SHIFT_CLOSE",
   sourceShiftIds:previous.length?previous.map(row=>row.id):[actor.shiftId],paidAt:previous[0]?.at??now,createdAt:now,
  });
 }};
}
