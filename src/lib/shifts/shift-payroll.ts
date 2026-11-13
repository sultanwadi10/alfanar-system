import type { EmployeeShiftTimeSettings } from "@/types/employee-schedule";

export const DEFAULT_SHIFT_TIMES: EmployeeShiftTimeSettings = { morningStart: "08:00", morningEnd: "16:00", eveningStart: "16:00", eveningEnd: "00:00" };
export function shiftTimesOverlap(settings: EmployeeShiftTimeSettings) {
  const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  const intervals = (start: string, end: string) => {
    const a = minutes(start), b = minutes(end);
    return a < b ? [[a, b]] : [[a, 1440], [0, b]];
  };
  return intervals(settings.morningStart, settings.morningEnd).some(([a, b]) => intervals(settings.eveningStart, settings.eveningEnd).some(([c, d]) => Math.max(a, c) < Math.min(b, d)));
}
export function validWage(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= 100_000_000;
}
export function settleShiftCash(cashFils: number, wageFils: number, actualFils: number) {
  if (![cashFils, actualFils].every(value => Number.isSafeInteger(value) && value >= 0) || !validWage(wageFils)) throw new Error("Invalid shift money");
  // A negative expected handover remains visible to management; never silently cap the wage.
  const expectedCashFils = cashFils - wageFils;
  return { expectedCashFils, differenceFils: actualFils - expectedCashFils };
}
export function shiftTimeSnapshot(at: Date, settings: EmployeeShiftTimeSettings) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Amman", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(at);
  const p = (key: string) => parts.find(x => x.type === key)!.value;
  const minute = Number(p("hour")) * 60 + Number(p("minute"));
  const minutes = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
  const candidates = (["morning", "evening"] as const).filter(key => {
    const start = minutes(settings[`${key}Start`]), end = minutes(settings[`${key}End`]);
    return start !== end && (start < end ? minute >= start && minute < end : minute >= start || minute < end);
  });
  const key = candidates.length === 1 ? candidates[0] : null;
  let workDay = `${p("year")}-${p("month")}-${p("day")}`;
  if (key && minutes(settings[`${key}End`]) < minutes(settings[`${key}Start`]) && minute < minutes(settings[`${key}End`])) {
    const day = new Date(`${workDay}T12:00:00Z`); day.setUTCDate(day.getUTCDate() - 1); workDay = day.toISOString().slice(0, 10);
  }
  return { workDay, shiftType: key === "morning" ? "MORNING" : key === "evening" ? "EVENING" : "OTHER", times: { ...settings } };
}

export type WageSettlementStatus="PAID"|"ALREADY_PAID"|"UNCONFIGURED";
export function recordedShiftWage(record:{payrollVersion?:unknown;wageSettlement?:unknown;wageFilsSnapshot?:unknown;wagePaidFils?:unknown}):number|null{
 if(record.payrollVersion===2){
  if(record.wageSettlement==="ALREADY_PAID"){
   if(record.wagePaidFils!==0)throw Error("Invalid repeated daily wage");
   return 0;
  }
  if(record.wageSettlement==="UNCONFIGURED"){
   if(record.wagePaidFils!==0||record.wageFilsSnapshot!=null)throw Error("Invalid unconfigured daily wage");
   return null;
  }
  if(record.wageSettlement!=="PAID"||!validWage(record.wageFilsSnapshot)||record.wagePaidFils!==record.wageFilsSnapshot)throw Error("Invalid daily wage settlement");
 }
 if(!validWage(record.wageFilsSnapshot))return null;
 if(!validWage(record.wagePaidFils))throw Error("Invalid recorded wage");
 return record.wagePaidFils;
}
