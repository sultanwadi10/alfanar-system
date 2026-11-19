import assert from "node:assert/strict";
export async function checkShiftOpening({db,load,check,projectId,actor,Timestamp}){
  assert.equal(projectId,"demo-alfanar-checks");assert.equal(process.env.FIRESTORE_EMULATOR_HOST,"127.0.0.1:8180");
  const {startShift,getShiftOpeningSuggestion}=load("@/lib/shifts/shift-repository"),{emptyRosterSchedule}=load("@/lib/employees/roster-week");
  const employeeId=actor.employeeId+"-evening",storeAuthUid=actor.storeAuthUid+"-opening";
  const ref=db.collection("employeeRosterWeeks").doc("2026-11-14"),week=(await ref.get()).data();
  const settings={morningStart:"08:00",morningEnd:"16:05",eveningStart:"16:08",eveningEnd:"01:00"};
  await ref.set({...week,settings,schedules:{...week.schedules,[employeeId]:{...emptyRosterSchedule(),thursday:["EVENING"]}}});
  const original=Timestamp.now;
  Timestamp.now=()=>Timestamp.fromDate(new Date("2026-11-19T13:01:13.368Z"));
  try{
    await check("automatic opening uses the roster at 16:01 and retry never rewrites an open shift",async()=>{
      const opened=await startShift({storeAuthUid,employeeId,employeeName:"موظف مسائي"});const record=(await db.collection("shifts").doc(opened.id).get()).data();assert.equal(record.shiftTimeSnapshot.shiftType,"EVENING");assert.equal(record.shiftTimeSnapshot.workDay,"2026-11-19");assert.equal(record.shiftTypeSource,"AUTO_SCHEDULE");assert.equal((await startShift({storeAuthUid,employeeId,employeeName:"موظف مسائي",shiftType:"MORNING"})).id,opened.id);assert.equal((await db.collection("shifts").doc(opened.id).get()).data().shiftTimeSnapshot.shiftType,"EVENING");
    });
    await check("explicit manual choice remains allowed before the scheduled time",async()=>{
      const opened=await startShift({storeAuthUid:storeAuthUid+"-manual",employeeId,employeeName:"موظف مسائي",shiftType:"MORNING"});const record=(await db.collection("shifts").doc(opened.id).get()).data();assert.equal(record.shiftTimeSnapshot.shiftType,"MORNING");assert.equal(record.shiftTypeSource,"MANUAL");
    });
  }finally{Timestamp.now=original;}
  assert.ok(getShiftOpeningSuggestion);
}
