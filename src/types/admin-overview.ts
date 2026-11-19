export type DashboardPeriod = "shift" | "today" | "yesterday" | "week";
export type DashboardChannel = "store" | "delivery";
export type DashboardEvent = { coupons?:number;pendingCoupons?:number;deferred?:boolean;items?: Array<{ name: string; quantity: number; value: number }>; id: string; channel: DashboardChannel; kind: "sale" | "booklet" | "collection"; number: string; employee: string; payment: "CASH" | "CLICK" | "COUPON"; amount: number; at: string; bucket: string; href: string };
export type DashboardStatus = { at: string; shifts: Array<{ id: string; employee: string; openedAt: string }>; pendingCount: number; pendingCollectionCount: number; pendingCollectionFils: number; lowStockCount: number; owedBottles: number; partial: boolean };
export type StoreActivityBucket={key:string;label:string;fullLabel:string;bottles:number;other:number;count:number};
export type DashboardOverview = {
  selectedShiftId?: string; shifts?: Array<{id:string; employee:string; openedAt:string; closedAt:string|null; shiftType:"MORNING"|"EVENING"|null; workDay:string}>; expectedCashFils?:number;
  cashCount?: {banknotesFils:number|null;coinsFils:number|null;actualCashFils:number|null;differenceFils:number|null;wagePaidFils:number;closed:boolean};
  storeActivity?:StoreActivityBucket[]; storeActivityUnclassifiedFils?:number;
  period: DashboardPeriod; label: string; start: string; end: string; at: string; status: DashboardStatus;
  storeSales: number; deliverySales: number; storeCount: number; deliveryCount: number;
  storeCash: number; deliveryCash: number; storeClick: number; deliveryClick: number; couponSales: number; couponCount:number;couponPendingCount:number;couponAwaiting: number;
  bookletCash: number; bookletClick: number; bookletCount: number;
  buckets: Array<{ key: string; label: string; fullLabel: string; store: number; delivery: number; count: number }>;
  products: Array<{ id: string; name: string; unit: string; quantity: number; value: number }>;
  events: DashboardEvent[]; eventCount: number; partial: boolean;
};
