import "server-only";
import { bookletCashPeriods } from "@/lib/coupons/booklet-cash-periods";
import { Timestamp } from "firebase-admin/firestore";
import { getFirebaseAdminFirestore } from "@/lib/firebase/admin";
import { ammanDayKey, ammanMidnight, calendarDay, dashboardRange, getDashboardOverview } from "./dashboard-overview";
import type { AdminReports, ReportPeriod, ShiftReportRow } from "@/types/admin-reports";
import { recordedShiftWage } from "@/lib/shifts/shift-payroll";
const MAX_ROWS = 5000;
export function reportRange(period: ReportPeriod, start?: string, end?: string, now = new Date()) {
  if(period==="month"||period==="lastMonth"){
    const today=ammanDayKey(now),monthStart=today.slice(0,7)+"-01";
    const previous=new Date(monthStart+"T12:00:00Z");previous.setUTCMonth(previous.getUTCMonth()-1);
    const first=period==="month"?monthStart:previous.toISOString().slice(0,10);
    const last=period==="month"?calendarDay(today,1):monthStart;
    return {start:ammanMidnight(first),end:ammanMidnight(last),first,label:period==="month"?"هذا الشهر":"الشهر الماضي"};
  }
  if (period !== "custom") return dashboardRange(period, now);
  const valid = (s: string | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(`${s}T12:00:00Z`).toISOString().slice(0, 10) === s;
  if (!valid(start) || !valid(end) || end < start || end > ammanDayKey(now) || Date.parse(end) - Date.parse(start) > 89 * 86400000) throw Error("INVALID_REPORT_RANGE");
  return { start: ammanMidnight(start), end: ammanMidnight(calendarDay(end, 1)), first: start, label: `${start} — ${end}` };
}
function unsigned(value: unknown): number { if (!Number.isSafeInteger(value) || (value as number) < 0) throw Error("Invalid report financial record"); return value as number; }
function signed(value: unknown): number { if (!Number.isSafeInteger(value)) throw Error("Invalid report balance"); return value as number; }
const iso = (value: unknown) => value instanceof Timestamp ? value.toDate().toISOString() : null;
export async function getAdminReports(period: ReportPeriod, start?: string, end?: string, now = new Date()): Promise<AdminReports> {
  const range = reportRange(period, start, end, now), db = getFirebaseAdminFirestore();
  const ranged = (name: string, field: string) => db.collection(name).where(field, ">=", Timestamp.fromDate(range.start)).where(field, "<", Timestamp.fromDate(new Date(Math.min(range.end.getTime(), now.getTime() + 1)))).orderBy(field, "desc").limit(MAX_ROWS + 1).get();
  const [overview, closed, movements, items, periodCash, employees] = await Promise.all([getDashboardOverview(period === "custom" || period === "month" || period === "lastMonth" ? "week" : period, now, range), ranged("shifts", "closedAt"), ranged("inventoryMovements", "createdAt"), db.collection("inventoryItems").limit(MAX_ROWS + 1).get(), bookletCashPeriods(range.start,range.end,now), db.collection("employees").select("name","isActive").limit(MAX_ROWS+1).get()]);
  const shifts: ShiftReportRow[] = closed.docs.slice(0, MAX_ROWS).flatMap(doc => {
    const v = doc.data(), openedAt = iso(v.openedAt), closedAt = iso(v.closedAt);
    if (v.status !== "CLOSED" || !openedAt || !closedAt) return [];
    const cash = unsigned(v.cashSalesFils), actual = unsigned(v.actualCashFils);
    const wage = recordedShiftWage(v);
    const expected = Number.isSafeInteger(v.expectedHandoverFils) ? signed(v.expectedHandoverFils) : cash;
    if (expected !== cash - (wage ?? 0) || signed(v.differenceFils) !== actual - expected) throw Error("Inconsistent shift settlement");
    const snapshot = v.shiftTimeSnapshot;
    return [{ id: doc.id, employeeId: typeof v.closedByEmployeeId === "string" && v.closedByEmployeeId ? v.closedByEmployeeId : typeof v.openedByEmployeeId === "string" && v.openedByEmployeeId ? v.openedByEmployeeId : null, employee: String(v.closedByEmployeeNameSnapshot ?? v.openedByEmployeeNameSnapshot ?? "موظف"), openedAt, closedAt, workDay: snapshot?.workDay ?? null, shiftType: snapshot?.shiftType === "MORNING" || snapshot?.shiftType === "EVENING" ? snapshot.shiftType : "OTHER", times: snapshot?.times ?? null, cash, wage, wageStatus: v.payrollVersion === 2 ? v.wageSettlement : undefined, expected, actual, difference: actual - expected, sales: unsigned(v.totalSalesFils), click: unsigned(v.clickSalesFils), count: unsigned(v.saleCount) }];
  });
  const purchases = movements.docs.slice(0, MAX_ROWS).flatMap(doc => {
    const v = doc.data(), at = iso(v.createdAt);
    if (v.kind !== "RECEIVE" || !at) return [];
    const quantity = signed(v.changes?.room ?? 0) + signed(v.changes?.cooler ?? 0);
    if (quantity <= 0) throw Error("Invalid receipt quantity");
    return [{ id: doc.id, at, name: String(v.itemName ?? "صنف"), code: String(v.code ?? ""), supplier: String(v.supplier ?? "غير محدد"), quantity, unit: String(v.unit ?? "وحدة"), packs: Number.isSafeInteger(v.unitsPerPack) && v.unitsPerPack > 0 ? quantity / v.unitsPerPack : null, packLabel: String(v.packLabel ?? "عبوة"), cost: unsigned(v.totalCostFils), reason: String(v.reason ?? "") }];
  });
  const stock = items.docs.slice(0, MAX_ROWS).flatMap(doc => {
    const v = doc.data(); if (v.trashed || !v.active) return [];
    const room = unsigned(v.room), cooler = unsigned(v.cooler), reserved = unsigned(v.reservedRoom) + unsigned(v.reservedCooler), available = room + cooler - reserved;
    if (available < 0) throw Error("Invalid available stock");
    return [{ id: doc.id, name: String(v.name), code: String(v.code), kind: String(v.kind), unit: String(v.baseUnit), unitsPerPack: unsigned(v.unitsPerPack), packLabel: String(v.packLabel), room, cooler, available, reserved, owed: unsigned(v.owed), out: unsigned(v.out), low: available <= unsigned(v.lowStock) }];
  });
  return { employees:employees.docs.slice(0,MAX_ROWS).map(d=>({id:d.id,name:String(d.data().name??"موظف"),active:d.data().isActive===true})), cashPeriods:periodCash.rows, overview, shifts, purchases, stock, at: now.toISOString(), label: range.label, start: range.start.toISOString(), end: overview.end, partial: periodCash.partial || overview.partial || [closed, movements, items, employees].some(s => s.size > MAX_ROWS), counts: { shifts: shifts.length, purchases: purchases.length, stock: stock.length } };
}
