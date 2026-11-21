import type { EmployeeSchedule, EmployeeShiftTimeSettings, EmployeeShiftType, EmployeeWeekday } from "@/types/employee-schedule";
import { ammanCalendarDate } from "@/lib/employees/roster-week";
import { shiftTimeSnapshot } from "./shift-payroll";

type PreviousShift={type:EmployeeShiftType;workDay:string;closedAt:Date};
export function suggestShiftType(at:Date,settings:EmployeeShiftTimeSettings,schedule:EmployeeSchedule,previous?:PreviousShift){
  const clock=shiftTimeSnapshot(at,settings),today=ammanCalendarDate(at);
  const days:EmployeeWeekday[]=["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
  const day=days[new Date(clock.workDay+"T12:00:00Z").getUTCDay()],assigned=schedule[day];
  if(assigned?.length===1)return {type:assigned[0],source:"AUTO_SCHEDULE"} as const;
  if(clock.workDay<today&&clock.shiftType==="EVENING")return {type:"EVENING",source:"AUTO_CLOCK"} as const;
  if(previous&&(previous.workDay===today||previous.workDay===clock.workDay)&&previous.closedAt.getTime()<=at.getTime()&&at.getTime()-previous.closedAt.getTime()<=12*60*60*1000)return {type:previous.type==="MORNING"?"EVENING":"MORNING",source:"AUTO_HANDOVER"} as const;
  if(clock.shiftType==="MORNING"||clock.shiftType==="EVENING")return {type:clock.shiftType,source:"AUTO_CLOCK"} as const;
  const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Amman",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(at);
  const minute=Number(parts.find(p=>p.type==="hour")!.value)*60+Number(parts.find(p=>p.type==="minute")!.value);
  const distance=(s:string)=>(Number(s.slice(0,2))*60+Number(s.slice(3))-minute+1440)%1440;
  return {type:distance(settings.morningStart)<=distance(settings.eveningStart)?"MORNING":"EVENING",source:"AUTO_CLOCK"} as const;
}
