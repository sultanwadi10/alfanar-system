import type { EmployeeSchedule,EmployeeShiftTimeSettings } from "@/types/employee-schedule";
import { addRosterDays,rosterDays,rosterDateLabel,rosterRangeLabel,rosterWeekStart } from "./roster-week";
export { rosterDays } from "./roster-week";
export function rosterTime(time:string){const [h,m]=time.split(":").map(Number);return `${h%12||12}:${String(m).padStart(2,"0")} ${h<12?"ص":"م"}`;}
export function buildRosterShare(employees:readonly {id:string;name:string;isActive:boolean}[],schedules:Record<string,EmployeeSchedule>,settings:EmployeeShiftTimeSettings,weekStart=rosterWeekStart()){
  const time=(start:string,end:string)=>rosterTime(start)+" – "+rosterTime(end)+(end<=start?" (اليوم التالي)":"");
  const morning=time(settings.morningStart,settings.morningEnd),evening=time(settings.eveningStart,settings.eveningEnd);
  const rows=rosterDays.map((day,index)=>({day:day.label,date:addRosterDays(weekStart,index),dateLabel:rosterDateLabel(addRosterDays(weekStart,index)),morning:employees.filter(e=>schedules[e.id]?.[day.key]?.includes("MORNING")).map(e=>e.name).join(" • ")||"—",evening:employees.filter(e=>schedules[e.id]?.[day.key]?.includes("EVENING")).map(e=>e.name).join(" • ")||"—"}));
  const range=rosterRangeLabel(weekStart);
  const text=["محطة الفنار — جدول الدوام الأسبوعي",range,"الصباحي: "+morning,"المسائي: "+evening,...rows.flatMap(row=>["",`${row.day} ${row.dateLabel}`,"صباحي: "+row.morning,"مسائي: "+row.evening])].join("\n");
  return {weekStart,range,morning,evening,rows,text};
}
export type RosterShareData=ReturnType<typeof buildRosterShare>;
