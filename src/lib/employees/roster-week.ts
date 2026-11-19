import type { EmployeeSchedule,EmployeeShiftTimeSettings,EmployeeShiftType,EmployeeWeekday } from "@/types/employee-schedule";
export const rosterDays:readonly {key:EmployeeWeekday;label:string}[]=[{key:"saturday",label:"السبت"},{key:"sunday",label:"الأحد"},{key:"monday",label:"الاثنين"},{key:"tuesday",label:"الثلاثاء"},{key:"wednesday",label:"الأربعاء"},{key:"thursday",label:"الخميس"},{key:"friday",label:"الجمعة"}];
export type RosterEmployee={id:string;name:string;isActive:boolean};
export type RosterWeek={weekStart:string;revision:number;settings:EmployeeShiftTimeSettings;schedules:Record<string,EmployeeSchedule>;employees:RosterEmployee[]};
export function emptyRosterSchedule():EmployeeSchedule{return {saturday:[],sunday:[],monday:[],tuesday:[],wednesday:[],thursday:[],friday:[]};}
export function ammanCalendarDate(now=new Date()):string{const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Amman",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(now);const part=(key:string)=>parts.find(p=>p.type===key)!.value;return `${part("year")}-${part("month")}-${part("day")}`;}
export function validRosterDate(value:string):boolean{return /^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+"T12:00:00Z"))&&new Date(value+"T12:00:00Z").toISOString().slice(0,10)===value;}
export function addRosterDays(date:string,days:number):string{if(!validRosterDate(date))throw Error("Invalid roster date");const result=new Date(date+"T12:00:00Z");result.setUTCDate(result.getUTCDate()+days);return result.toISOString().slice(0,10);}
export function rosterWeekStart(date=ammanCalendarDate()):string{if(!validRosterDate(date))throw Error("Invalid roster date");const day=new Date(date+"T12:00:00Z").getUTCDay();return addRosterDays(date,-((day+1)%7));}
export function validRosterWeek(value:string):boolean{return validRosterDate(value)&&rosterWeekStart(value)===value;}
export function rosterDateLabel(value:string):string{return new Intl.DateTimeFormat("en-GB",{timeZone:"UTC",day:"2-digit",month:"2-digit"}).format(new Date(value+"T12:00:00Z"));}
export function rosterRangeLabel(start:string):string{return `${rosterDateLabel(start)} – ${rosterDateLabel(addRosterDays(start,6))} / ${start.slice(0,4)}`;}
export function rosterIntervals(week:Pick<RosterWeek,"weekStart"|"settings"|"schedules">){
  const base=Date.parse(week.weekStart+"T00:00:00Z")/60000,minutes=(value:string)=>Number(value.slice(0,2))*60+Number(value.slice(3));
  return Object.entries(week.schedules).flatMap(([employeeId,schedule])=>rosterDays.flatMap((day,index)=>(schedule[day.key]??[]).map(shift=>{const key=shift==="MORNING"?"morning":"evening",start=minutes(week.settings[`${key}Start`]),end=minutes(week.settings[`${key}End`]);return {employeeId,day:addRosterDays(week.weekStart,index),shift,start:base+index*1440+start,end:base+index*1440+end+(end<=start?1440:0)};})));
}
export function rosterConflict(weeks:Pick<RosterWeek,"weekStart"|"settings"|"schedules">[]){
  const intervals=weeks.flatMap(rosterIntervals).sort((a,b)=>a.employeeId.localeCompare(b.employeeId)||a.start-b.start);
  for(let i=1;i<intervals.length;i++)if(intervals[i].employeeId===intervals[i-1].employeeId&&intervals[i].start<intervals[i-1].end)return intervals[i];
  return null;
}
export function setRosterAssignment(schedules:RosterWeek["schedules"],employeeId:string,day:EmployeeWeekday,shift:EmployeeShiftType,selected:boolean){const schedule=schedules[employeeId]??emptyRosterSchedule(),assigned=schedule[day];return {...schedules,[employeeId]:{...schedule,[day]:selected?[...assigned.filter(s=>s!==shift),shift].sort():assigned.filter(s=>s!==shift)}};}
