import "server-only";
import { createHash } from "node:crypto";
import { Timestamp,type Firestore,type Transaction } from "firebase-admin/firestore";
import { getFirebaseAdminFirestore } from "@/lib/firebase/admin";
import { DEFAULT_SHIFT_TIMES,shiftTimeSnapshot } from "@/lib/shifts/shift-payroll";
import { employeeScheduleSchema,shiftTimeSettingsSchema } from "@/lib/validation/employee-schedule";
import { ammanCalendarDate,addRosterDays,emptyRosterSchedule,rosterConflict,rosterWeekStart,validRosterWeek,type RosterWeek } from "./roster-week";

export class RosterError extends Error{constructor(public code:string,message:string){super(message);this.name="RosterError";}}
const WEEKS="employeeRosterWeeks",BASELINE="employeeRosterBaseline",LIMIT=150;
function checkWeek(value:string){if(!validRosterWeek(value))throw new RosterError("INVALID_WEEK","اختر أسبوعًا يبدأ يوم السبت.");}
function sameSchedule(a:unknown,b:unknown){const left=employeeScheduleSchema.safeParse(a),right=employeeScheduleSchema.safeParse(b);return left.success&&right.success&&Object.keys(left.data).every(key=>{const day=key as keyof typeof left.data;return [...left.data[day]].sort().join() === [...right.data[day]].sort().join();});}
function storedWeek(weekStart:string,data:FirebaseFirestore.DocumentData):RosterWeek{
  const settings=shiftTimeSettingsSchema.safeParse(data.settings);
  if(!settings.success||!Number.isSafeInteger(data.revision)||data.revision<0||!Array.isArray(data.employees)||!data.schedules)throw new RosterError("INVALID_RECORD","بيانات جدول الدوام غير متسقة.");
  const schedules:RosterWeek["schedules"]={};for(const [id,value] of Object.entries(data.schedules)){const parsed=employeeScheduleSchema.safeParse(value);if(!parsed.success)throw new RosterError("INVALID_RECORD","بيانات جدول الدوام غير متسقة.");schedules[id]=parsed.data;}
  return {weekStart,revision:data.revision,settings:settings.data,schedules,employees:data.employees.map((e:FirebaseFirestore.DocumentData)=>({id:String(e.id),name:String(e.name),isActive:e.isActive===true}))};
}
async function legacyRoster(db:Firestore,weekStart:string,tx?:Transaction):Promise<RosterWeek>{
  const employeesQuery=db.collection("employees").limit(LIMIT+1),schedulesQuery=db.collection("employeeSchedules").limit(LIMIT+1),timesRef=db.collection("systemSettings").doc("employeeShiftTimes");
  const [employees,schedules,times]=await Promise.all(tx?[tx.get(employeesQuery),tx.get(schedulesQuery),tx.get(timesRef)]:[employeesQuery.get(),schedulesQuery.get(),timesRef.get()]);
  if(employees.size>LIMIT||schedules.size>LIMIT)throw new RosterError("TOO_MANY_EMPLOYEES","عدد سجلات الموظفين يتجاوز الحد المتاح للجدول.");
  const settings=shiftTimeSettingsSchema.parse(times.data()??DEFAULT_SHIFT_TIMES),byId:RosterWeek["schedules"]={};
  for(const doc of schedules.docs)byId[doc.id]=employeeScheduleSchema.parse({...emptyRosterSchedule(),...doc.data()});
  return {weekStart,revision:0,settings,schedules:byId,employees:employees.docs.map(doc=>({id:doc.id,name:String(doc.data().name??"موظف"),isActive:doc.data().isActive===true}))};
}
export async function getRosterWeek(weekStart=rosterWeekStart(),now=new Date()):Promise<RosterWeek>{
  checkWeek(weekStart);const db=getFirebaseAdminFirestore(),doc=await db.collection(WEEKS).doc(weekStart).get();if(doc.exists)return storedWeek(weekStart,doc.data()!);
  const baseline=await db.collection("systemSettings").doc(BASELINE).get();
  const today=rosterWeekStart(ammanCalendarDate(now));
  if(baseline.exists&&baseline.data()?.weekStart===weekStart)return storedWeek(weekStart,baseline.data()!);
  if(!baseline.exists&&weekStart===today)return legacyRoster(db,weekStart);
  const active=await db.collection(WEEKS).doc(today).get();
  const source=active.exists?storedWeek(today,active.data()!):baseline.exists?storedWeek(String(baseline.data()!.weekStart),baseline.data()!):await legacyRoster(db,today);
  return {weekStart,revision:0,settings:source.settings,schedules:{},employees:source.employees};
}
export async function saveRosterWeek(input:Omit<RosterWeek,"employees"|"revision">&{requestId:string;expectedRevision:number},adminUid:string,now=new Date()){
  if(!/^[0-9a-f-]{36}$/i.test(input.requestId)||!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<0||Object.keys(input.schedules).length>LIMIT||Object.entries(input.schedules).some(([id,schedule])=>!/^[A-Za-z0-9_-]{1,128}$/.test(id)||!employeeScheduleSchema.safeParse(schedule).success)||!shiftTimeSettingsSchema.safeParse(input.settings).success)throw new RosterError("INVALID_INPUT","تحقق من الجدول والمواعيد.");
  checkWeek(input.weekStart);const today=rosterWeekStart(ammanCalendarDate(now));
  if(input.weekStart<today)throw new RosterError("PAST_WEEK","الأسبوع السابق مغلق للتعديل.");
  if(input.weekStart>addRosterDays(today,364))throw new RosterError("INVALID_WEEK","الأسبوع المحدد خارج النطاق المتاح.");
  const db=getFirebaseAdminFirestore(),ref=db.collection(WEEKS).doc(input.weekStart),currentRef=db.collection(WEEKS).doc(today),baselineRef=db.collection("systemSettings").doc(BASELINE),opRef=db.collection("employeeRosterRequests").doc(input.requestId);
  const fingerprint=createHash("sha256").update(JSON.stringify({weekStart:input.weekStart,settings:input.settings,schedules:Object.fromEntries(Object.entries(input.schedules).sort()),expectedRevision:input.expectedRevision,adminUid})).digest("hex");
  return db.runTransaction(async tx=>{
    const op=await tx.get(opRef);if(op.exists){if(op.data()?.fingerprint!==fingerprint)throw new RosterError("REQUEST_CONFLICT","طلب الحفظ مستخدم لتعديلات مختلفة.");return op.data()!.result as RosterWeek;}
    const [doc,current,baseline,prev,next]=await Promise.all([tx.get(ref),tx.get(currentRef),tx.get(baselineRef),tx.get(db.collection(WEEKS).doc(addRosterDays(input.weekStart,-7))),tx.get(db.collection(WEEKS).doc(addRosterDays(input.weekStart,7)))]);
    const revision=doc.exists?storedWeek(input.weekStart,doc.data()!).revision:0;
    if(revision!==input.expectedRevision)throw new RosterError("REVISION_CONFLICT","تم تحديث هذا الأسبوع من جلسة أخرى. حدّث الجدول قبل الحفظ.");
    const legacy=!baseline.exists||!current.exists?await legacyRoster(db,today,tx):null;
    const frozenCurrent=current.exists?storedWeek(today,current.data()!):baseline.exists?(baseline.data()!.weekStart===today?storedWeek(today,baseline.data()!):{weekStart:today,revision:0,settings:storedWeek(String(baseline.data()!.weekStart),baseline.data()!).settings,schedules:{},employees:legacy?.employees??[]}):legacy!;
    const employeeDocs=await Promise.all(Object.keys(input.schedules).map(id=>tx.get(db.collection("employees").doc(id))));
    const existing=doc.exists?storedWeek(input.weekStart,doc.data()!):input.weekStart===today?frozenCurrent:null;
    for(const employee of employeeDocs){if(!employee.exists)throw new RosterError("EMPLOYEE_NOT_FOUND","أحد الموظفين لم يعد موجودًا.");if(employee.data()?.isActive!==true&&!sameSchedule(input.schedules[employee.id],existing?.schedules[employee.id]??emptyRosterSchedule()))throw new RosterError("EMPLOYEE_INACTIVE","لا يمكن تعديل دوام موظف معطل.");}
    const result:RosterWeek={weekStart:input.weekStart,revision:revision+1,settings:input.settings,schedules:input.schedules,employees:employeeDocs.map(d=>({id:d.id,name:String(d.data()!.name),isActive:d.data()!.isActive===true}))};
    const neighbors=[result];if(prev.exists)neighbors.push(storedWeek(addRosterDays(input.weekStart,-7),prev.data()!));else if(addRosterDays(input.weekStart,-7)===today)neighbors.push(frozenCurrent);else if(baseline.exists&&baseline.data()!.weekStart===addRosterDays(input.weekStart,-7))neighbors.push(storedWeek(baseline.data()!.weekStart,baseline.data()!));if(next.exists)neighbors.push(storedWeek(addRosterDays(input.weekStart,7),next.data()!));
    const conflict=rosterConflict(neighbors);if(conflict)throw new RosterError("SCHEDULE_OVERLAP",`مواعيد ${result.employees.find(e=>e.id===conflict.employeeId)?.name??"الموظف"} متداخلة بتاريخ ${conflict.day}.`);
    const at=Timestamp.fromDate(now);
    // Freeze the pre-existing week before storing any future plan. The legacy
    // repeating schedule is retained and never overwritten by this editor.
    if(!baseline.exists)tx.create(baselineRef,{...legacy!,updatedAt:at,updatedByAuthUid:adminUid});
    if(!current.exists&&input.weekStart!==today)tx.create(currentRef,{...frozenCurrent,weekStart:today,updatedAt:at,updatedByAuthUid:adminUid});
    tx.set(ref,{...result,updatedAt:at,updatedByAuthUid:adminUid});tx.create(opRef,{fingerprint,result,createdAt:at,adminUid});return result;
  });
}
export async function currentRosterContext(tx:Transaction,db:Firestore,at:Date,employeeId?:string){
  const day=ammanCalendarDate(at),week=rosterWeekStart(day),previousWeek=addRosterDays(week,-7);
  const [roster,baseline,legacy,oldSchedule,previous]=await Promise.all([tx.get(db.collection(WEEKS).doc(week)),tx.get(db.collection("systemSettings").doc(BASELINE)),tx.get(db.collection("systemSettings").doc("employeeShiftTimes")),employeeId?tx.get(db.collection("employeeSchedules").doc(employeeId)):Promise.resolve(null),day===week?tx.get(db.collection(WEEKS).doc(previousWeek)):Promise.resolve(null)]);
  let saved=roster.exists?storedWeek(week,roster.data()!):baseline.exists?storedWeek(String(baseline.data()!.weekStart),baseline.data()!):null,effectiveWeek=week;
  // Friday's overnight shift keeps Friday's roster and terms across Saturday.
  const prior=previous?.exists?storedWeek(previousWeek,previous.data()!):baseline.exists&&baseline.data()!.weekStart===previousWeek?storedWeek(previousWeek,baseline.data()!):null;
  if(day===week&&prior&&shiftTimeSnapshot(at,prior.settings).workDay<day){saved=prior;effectiveWeek=previousWeek;}
  const settings=saved?.settings??shiftTimeSettingsSchema.parse(legacy.data()??DEFAULT_SHIFT_TIMES);
  const schedule=employeeId&&saved?.weekStart===effectiveWeek?saved.schedules[employeeId]??emptyRosterSchedule():baseline.exists||roster.exists?emptyRosterSchedule():employeeScheduleSchema.parse({...emptyRosterSchedule(),...oldSchedule?.data()});
  return {settings,schedule};
}
export async function currentRosterTimes(tx:Transaction,db:Firestore,at:Date){return (await currentRosterContext(tx,db,at)).settings;}
