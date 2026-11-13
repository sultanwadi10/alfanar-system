import type { EmployeeSchedule,EmployeeShiftTimeSettings,EmployeeWeekday } from "@/types/employee-schedule";
export const rosterDays:{key:EmployeeWeekday;label:string}[]=[{key:"sunday",label:"الأحد"},{key:"monday",label:"الاثنين"},{key:"tuesday",label:"الثلاثاء"},{key:"wednesday",label:"الأربعاء"},{key:"thursday",label:"الخميس"},{key:"friday",label:"الجمعة"},{key:"saturday",label:"السبت"}];
export function rosterTime(time:string){const [h,m]=time.split(":").map(Number);return `${h%12||12}:${String(m).padStart(2,"0")} ${h<12?"ص":"م"}`;}
export function buildRosterShare(employees:readonly {id:string;name:string;isActive:boolean}[],schedules:Record<string,EmployeeSchedule>,settings:EmployeeShiftTimeSettings){
 const time=(start:string,end:string)=>rosterTime(start)+" – "+rosterTime(end)+(end<=start?" (اليوم التالي)":"");
 const morning=time(settings.morningStart,settings.morningEnd),evening=time(settings.eveningStart,settings.eveningEnd);
 const rows=rosterDays.map(day=>({day:day.label,morning:employees.filter(e=>e.isActive&&schedules[e.id]?.[day.key]?.includes("MORNING")).map(e=>e.name).join(" • ")||"—",evening:employees.filter(e=>e.isActive&&schedules[e.id]?.[day.key]?.includes("EVENING")).map(e=>e.name).join(" • ")||"—"}));
 const text=["*محطة الفنار — جدول الدوام الأسبوعي*","الصباحي: "+morning,"المسائي: "+evening,"بتوقيت عمّان",...rows.flatMap(row=>["","*"+row.day+"*","صباحي: "+row.morning,"مسائي: "+row.evening])].join("\n");
 return {morning,evening,rows,text};
}
export type RosterShareData=ReturnType<typeof buildRosterShare>;
