import type { DashboardOverview, DashboardPeriod } from "./admin-overview";
export type ReportPeriod = DashboardPeriod | "custom" | "month" | "lastMonth";
export type ShiftReportRow = {
  id: string; employeeId: string | null; employee: string; openedAt: string; closedAt: string; workDay: string | null;
  shiftType: "MORNING" | "EVENING" | "OTHER"; times: { morningStart: string; morningEnd: string; eveningStart: string; eveningEnd: string } | null;
  cash: number; wage: number | null; wageStatus?: "PAID" | "ALREADY_PAID" | "UNCONFIGURED"; expected: number; actual: number; difference: number; sales: number; click: number; count: number;
};
export type PurchaseReportRow = { id: string; at: string; name: string; code: string; supplier: string; quantity: number; unit: string; packs: number | null; packLabel: string; cost: number; reason: string };
export type StockReportRow = { id: string; name: string; code: string; kind: string; unit: string; unitsPerPack: number; packLabel: string; room: number; cooler: number; available: number; reserved: number; owed: number; out: number; low: boolean };
export type ReportEmployee={id:string;name:string;active:boolean};
export type AdminReports = {
  employees?:ReportEmployee[];
  cashPeriods?:BookletCashPeriod[]; overview: DashboardOverview; shifts: ShiftReportRow[]; purchases: PurchaseReportRow[]; stock: StockReportRow[];
  at: string; label: string; start: string; end: string; partial: boolean; counts: { shifts: number; purchases: number; stock: number };
};

export type BookletCashPeriod={id:string;day:string;period:string;shiftCash:number;receivableCash:number;receivableClick:number;bookletCash:number;bookletClick:number;bookletCashInShift?:number;wage:number;actual:number;expected:number;difference:number|null;open:number;closed:number;late:number;unknownWage:boolean};
