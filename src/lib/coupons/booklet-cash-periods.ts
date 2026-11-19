import "server-only";
import { Timestamp } from "firebase-admin/firestore";
import { getFirebaseAdminFirestore } from "@/lib/firebase/admin";
import { DEFAULT_SHIFT_TIMES, shiftTimeSnapshot, recordedShiftWage } from "@/lib/shifts/shift-payroll";
import type { BookletCashPeriod } from "@/types/admin-reports";
export async function bookletCashPeriods(start:Date,end:Date,now:Date){
 const db=getFirebaseAdminFirestore(),cutoff=new Date(Math.min(end.getTime(),now.getTime()+1));
 const [shifts,sales,receipts]=await Promise.all([db.collection("shifts").where("openedAt",">=",Timestamp.fromDate(new Date(start.getTime()-86400000))).where("openedAt","<",Timestamp.fromDate(cutoff)).orderBy("openedAt","desc").limit(5001).get(),db.collection("couponBookletSales").where("financialAt",">=",Timestamp.fromDate(start)).where("financialAt","<",Timestamp.fromDate(cutoff)).orderBy("financialAt","desc").limit(5001).get(),db.collection("receivableCollections").where("financialAt",">=",Timestamp.fromDate(start)).where("financialAt","<",Timestamp.fromDate(cutoff)).orderBy("financialAt","desc").limit(5001).get()]);
 const rows=new Map<string,BookletCashPeriod>();
 function get(day:string,period:string){const id=day+":"+period;if(!rows.has(id))rows.set(id,{id,day,period,shiftCash:0,receivableCash:0,receivableClick:0,bookletCash:0,bookletClick:0,bookletCashInShift:0,wage:0,actual:0,expected:0,difference:null,open:0,closed:0,late:0,unknownWage:false});return rows.get(id)!;}
 const day=(at:Date)=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Amman",year:"numeric",month:"2-digit",day:"2-digit"}).format(at);
 for(const doc of shifts.docs.slice(0,5000)){const s=doc.data();if(!(s.openedAt instanceof Timestamp)||!["OPEN","CLOSED"].includes(s.status))continue;
 const snapshot=s.shiftTimeSnapshot??{...shiftTimeSnapshot(s.openedAt.toDate(),DEFAULT_SHIFT_TIMES),shiftType:"OTHER"};
 if(snapshot.workDay<day(start)||snapshot.workDay>=day(end))continue;
 const row=get(snapshot.workDay,snapshot.shiftType);if(!Number.isSafeInteger(s.cashSalesFils))throw Error("Invalid period cash");row.shiftCash+=s.cashSalesFils;
 if(s.status==="OPEN")row.open++;else{row.closed++;if(!Number.isSafeInteger(s.actualCashFils)||s.actualCashFils<0)throw Error("Invalid period actual");row.actual+=s.actualCashFils;const wage=recordedShiftWage(s);if(wage!==null)row.wage+=wage;else row.unknownWage=true;}
 }
 for(const doc of sales.docs.slice(0,5000)){const s=doc.data();if(s.channel!=="STORE"||s.isVoided||s.status==="CANCELLED")continue;
 if(!Number.isSafeInteger(s.priceFils)||s.priceFils<0||!["CASH","CLICK"].includes(s.paymentMethod)||!["MORNING","EVENING"].includes(s.financialPeriod))throw Error("Invalid store booklet period");
 const row=get(s.financialDate,s.financialPeriod);if(s.paymentMethod==="CASH"){row.bookletCash+=s.priceFils;if(s.shiftId)row.bookletCashInShift=(row.bookletCashInShift??0)+s.priceFils;}else row.bookletClick+=s.priceFils;
 const times=s.shiftTimesSnapshot,key=s.financialPeriod==="MORNING"?"morning":"evening";
 if(times&&s.createdAt instanceof Timestamp){const finish=new Date(s.financialDate+"T"+times[key+"End"]+":00+03:00");if(times[key+"End"]<=times[key+"Start"])finish.setUTCDate(finish.getUTCDate()+1);if(s.createdAt.toMillis()>finish.getTime())row.late++;}
 }
 for(const doc of receipts.docs.slice(0,5000)){const r=doc.data();if(r.kind!=="MONEY"||r.shiftId)continue;
 if(!Number.isSafeInteger(r.amount)||r.amount<1||!["CASH","CLICK"].includes(r.method)||!/^\d{4}-\d{2}-\d{2}$/.test(r.financialDate)||!["MORNING","EVENING","OTHER"].includes(r.financialPeriod))throw Error("Invalid receivable period");
 const row=get(r.financialDate,r.financialPeriod);if(r.method==="CASH")row.receivableCash+=(r.direction===-1?-1:1)*r.amount;else row.receivableClick+=(r.direction===-1?-1:1)*r.amount;
 }
 // Collections taken by management outside a shift are already received;
 // they must not create a fictitious employee handover shortage.
 for(const row of rows.values()){row.expected=row.shiftCash+row.bookletCash-(row.bookletCashInShift??0)-row.wage;row.difference=row.open||!row.closed||row.unknownWage?null:row.actual-row.expected;}
 return {rows:[...rows.values()].sort((a,b)=>b.id.localeCompare(a.id)),partial:shifts.size>5000||sales.size>5000||receipts.size>5000};
}
