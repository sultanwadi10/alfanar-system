import "server-only";
import { cache } from "react";
import { Timestamp, type DocumentData, type QuerySnapshot } from "firebase-admin/firestore";
import { getFirebaseAdminFirestore } from "@/lib/firebase/admin";
import type { DashboardEvent, DashboardOverview, DashboardPeriod, DashboardStatus } from "@/types/admin-overview";
const MAX_ROWS = 5000;
const zone = "Asia/Amman";
const dayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" });
function dayKey(date: Date) { const parts = dayFormat.formatToParts(date); const p = (type: string) => parts.find(p => p.type === type)!.value; return `${p("year")}-${p("month")}-${p("day")}`; }
function midnight(key: string) {
  const utc = new Date(`${key}T12:00:00Z`);
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(utc);
  const read = (type: string) => Number(parts.find(p => p.type === type)!.value);
  const offset = Date.UTC(read("year"), read("month") - 1, read("day"), read("hour"), read("minute"), read("second")) - utc.getTime();
  return new Date(new Date(`${key}T00:00:00Z`).getTime() - offset);
}
function shiftDay(key: string, days: number) { const date = new Date(`${key}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }
export function dashboardRange(period: DashboardPeriod, now = new Date()) {
  const today = dayKey(now), first = shiftDay(today, period === "week" ? -6 : period === "yesterday" ? -1 : 0), last = period === "yesterday" ? today : shiftDay(today, 1);
  return { start: midnight(first), end: midnight(last), first, label: period === "week" ? "آخر 7 أيام" : period === "yesterday" ? "أمس" : "اليوم" };
}
const date = (value: unknown) => value instanceof Timestamp ? value.toDate() : null;
function amount(value: unknown): number { if (!Number.isSafeInteger(value) || (value as number) < 0) throw Error("Invalid dashboard financial record"); return value as number; }
const rows = (snapshot: QuerySnapshot) => snapshot.docs.slice(0, MAX_ROWS);
export const getDashboardStatus = cache(async (inventory?: Promise<QuerySnapshot>): Promise<DashboardStatus> => {
  const db = getFirebaseAdminFirestore();
  const [indices, pending, items, debts] = await Promise.all([db.collection("activeStoreShifts").limit(21).get(), db.collection("deliveryOrders").where("status", "in", ["NEW", "READY"]).limit(MAX_ROWS + 1).get(), inventory ?? db.collection("inventoryItems").limit(MAX_ROWS + 1).get(), db.collection("bottleDebtAccounts").where("quantity", ">", 0).limit(MAX_ROWS + 1).get()]);
  const shiftIds = [...new Set(indices.docs.map(d => d.data().shiftId).filter((id): id is string => typeof id === "string" && /^[A-Za-z0-9_-]{1,150}$/.test(id)))];
  const shiftDocs = await Promise.all(shiftIds.map(id => db.collection("shifts").doc(id).get()));
  const shifts = shiftDocs.flatMap(d => { const v = d.data(), at = date(v?.openedAt); return v?.status === "OPEN" && at ? [{ id: d.id, employee: String(v.openedByEmployeeNameSnapshot ?? "موظف"), openedAt: at.toISOString() }] : []; });
  let pendingCollectionCount = 0, pendingCollectionFils = 0;
  for (const d of rows(pending)) { const v = d.data(); if ((v.paymentMethod === "CASH" || v.paymentMethod === "CLICK") && v.paymentState !== "COLLECTED") { ++pendingCollectionCount; pendingCollectionFils += amount(v.totalFils); } }
  const lowStockCount = rows(items).filter(d => { const i = d.data(); return i.active && !i.trashed && Number.isSafeInteger(i.lowStock) && [i.room, i.cooler, i.reservedRoom, i.reservedCooler].every(Number.isSafeInteger) && i.room + i.cooler - i.reservedRoom - i.reservedCooler <= i.lowStock; }).length;
  return { at: new Date().toISOString(), shifts, pendingCount: Math.min(pending.size, MAX_ROWS), pendingCollectionCount, pendingCollectionFils, lowStockCount, owedBottles: rows(debts).reduce((sum, d) => sum + amount(d.data().quantity), 0), partial: indices.size > 20 || [pending, items, debts].some(s => s.size > MAX_ROWS) };
});
export async function getDashboardOverview(period: DashboardPeriod = "today", now = new Date(), rangeOverride?: ReturnType<typeof dashboardRange>): Promise<DashboardOverview> {
  const db = getFirebaseAdminFirestore(), range = rangeOverride ?? dashboardRange(period, now);
  const cutoff = period === "yesterday" ? range.end : new Date(Math.min(range.end.getTime(), now.getTime() + 1));
  const ranged = (name: string, field: string) => db.collection(name).where(field, ">=", Timestamp.fromDate(range.start)).where(field, "<", Timestamp.fromDate(cutoff)).orderBy(field, "desc").limit(MAX_ROWS + 1).get();
  const stockRequest = db.collection("inventoryItems").limit(MAX_ROWS + 1).get();
  const [sales, delivered, collected, receipts, booklets, financialBooklets, policies, stock, productDefinitions, status] = await Promise.all([ranged("directSales", "createdAt"), ranged("deliveryOrders", "deliveredAt"), ranged("deliveryOrders", "collectedAt"), ranged("receivableCollections", "receivedAt"), ranged("couponBookletSales", "createdAt"), ranged("couponBookletSales", "financialAt"), db.collection("inventoryPolicies").limit(MAX_ROWS + 1).get(), stockRequest, db.collection("products").limit(MAX_ROWS + 1).get(), getDashboardStatus(stockRequest)]);
  const hourly = new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", hourCycle: "h23" });
  const bucketKey = (at: Date) => period === "week" ? dayKey(at) : hourly.format(at);
  const buckets = new Map<string, DashboardOverview["buckets"][number]>();
  const storeActivity=new Map<string,{bottles:number;other:number;count:number}>(),definitions=new Map(productDefinitions.docs.map(d=>[d.id,d.data()]));
  let storeActivityUnclassifiedFils=0;
  const events: DashboardEvent[] = [], products = new Map<string, DashboardOverview["products"][number]>();
  const stockById = new Map(stock.docs.map(d => [d.id, d.data()])), policyById = new Map(policies.docs.map(d => [d.id, d.data()]));
  let storeSales = 0, deliverySales = 0, storeCount = 0, deliveryCount = 0, storeCash = 0, deliveryCash = 0, storeClick = 0, deliveryClick = 0, couponSales = 0, couponAwaiting = 0, bookletCash = 0, bookletClick = 0;
  function register(channel: "store" | "delivery", id: string, v: DocumentData, at: Date, total: number) {
    if (!["CASH", "CLICK", "COUPON"].includes(v.paymentMethod)) throw Error("Unknown dashboard payment");
    const key = bucketKey(at), current = buckets.get(key) ?? { key, label: key, fullLabel: key, store: 0, delivery: 0, count: 0 };
    current[channel] += total; ++current.count; buckets.set(key, current);
    events.push({ items: (v.items ?? []).map((item: DocumentData) => ({ name: String(item.productNameSnapshot ?? "صنف"), quantity: amount(item.quantity), value: amount(item.lineTotalFils) })), id: `${channel}:${id}`, channel, kind: "sale", number: String(v.orderNumber ?? ""), employee: String(channel === "store" ? v.employeeNameSnapshot ?? "المحل" : v.deliveredByEmployeeName ?? v.deliveredByAdminName ?? v.employeeNameSnapshot ?? "الإدارة"), payment: v.paymentMethod, amount: total, at: at.toISOString(), bucket: key, href: channel === "delivery" ? `/admin/orders?order=${encodeURIComponent(id)}` : "/admin/reports" });
    for (const item of v.items ?? []) {
      const quantity = amount(item.quantity), value = amount(item.lineTotalFils), name = String(item.productNameSnapshot ?? "صنف");
      const p = policyById.get(item.productId), physical = p?.mode === "STOCK" ? stockById.get(p.itemId) : null;
      const unit = p?.mode === "REFILL" || item.category === "REFILL" ? "تعبئة" : physical?.packLabel ?? "وحدة بيع";
      const productKey = `${item.productId}:${unit}`;
      const existing = products.get(productKey) ?? { id: productKey, name, unit, quantity: 0, value: 0 };
      existing.quantity += quantity; existing.value += value; products.set(productKey, existing);
    }
  }
  for (const d of rows(sales)) {
    const v = d.data(), at = date(v.createdAt); if (!at || v.isVoided || v.status === "CANCELLED") continue;
    const total = amount(v.totalFils); storeSales += total; ++storeCount;
    if (v.paymentMethod === "CASH") storeCash += total; else if (v.paymentMethod === "CLICK") storeClick += total; else throw Error("Unknown counter payment");
    register("store", d.id, v, at, total);
    const key=bucketKey(at),current=storeActivity.get(key)??{bottles:0,other:0,count:0};current.count++;
    let lineSum=0;
    for(const item of v.items??[]){
      const value=amount(item.lineTotalFils);lineSum+=value;
      const category=item.category??definitions.get(item.productId)?.category??(policyById.get(item.productId)?.mode==="REFILL"?"REFILL":null);
      if(category==="REFILL"||category==="NEW_BOTTLE")current.bottles+=value;
      else if(category)current.other+=value;
      else storeActivityUnclassifiedFils+=value;
    }
    if(lineSum>total)throw Error("Store chart line totals exceed sale");
    storeActivityUnclassifiedFils+=total-lineSum;
    storeActivity.set(key,current);
  }
  for (const d of rows(delivered)) {
    const v = d.data(), at = date(v.deliveredAt); if (v.status !== "DELIVERED" || !at) continue;
    const total = amount(v.totalFils); deliverySales += total; ++deliveryCount;
    if (v.paymentMethod === "COUPON") { couponSales += total; if (v.paymentState === "AWAITING_BOOKLET_APPROVAL") ++couponAwaiting; }
    register("delivery", d.id, v, at, total);
  }
  const collectionRows = new Map(rows(collected).map(d => [d.id, d.data()]));
  // Older collected orders without collectedAt use their delivery timestamp.
  for (const d of rows(delivered)) if (!date(d.data().collectedAt) && d.data().paymentState === "COLLECTED") collectionRows.set(d.id, d.data());
  for (const v of collectionRows.values()) {
    if (v.collectionMode === "RECEIPTS" || v.status !== "DELIVERED" || v.paymentState !== "COLLECTED") continue;
    const total = amount(v.collectedFils ?? v.totalFils);
    if (v.paymentMethod === "CASH") deliveryCash += total; else if (v.paymentMethod === "CLICK") deliveryClick += total;
  }
    for (const d of rows(receipts)) {
      const receipt=d.data(); if(receipt.kind!=="MONEY") continue;
      if(receipt.method==="CASH") deliveryCash+=amount(receipt.amount);
      else if(receipt.method==="CLICK") deliveryClick+=amount(receipt.amount);
      else throw Error("Unknown receivable collection method");
    }
  for (const d of new Map([...rows(booklets),...rows(financialBooklets)].map(d=>[d.id,d])).values()) {
    const v = d.data(), at = date(v.channel === "STORE" ? v.financialAt ?? v.createdAt : v.createdAt); if (!at || at < range.start || at >= cutoff || v.isVoided || v.status === "CANCELLED") continue;
    const total = amount(v.priceFils), channel = typeof v.orderId === "string" && v.orderId ? "delivery" : v.channel === "STORE" ? "store" : null;
    if (!channel) throw Error("Unknown booklet collection source");
    if (v.paymentMethod === "CASH") { bookletCash += total; if (channel === "store") storeCash += total; else deliveryCash += total; }
    else if (v.paymentMethod === "CLICK") { bookletClick += total; if (channel === "store") storeClick += total; else deliveryClick += total; }
    else throw Error("Unknown booklet payment");
    events.push({ id: `booklet:${d.id}`, channel, kind: "booklet", number: "", employee: String(v.employeeNameSnapshot ?? "الإدارة"), payment: v.paymentMethod, amount: total, at: at.toISOString(), bucket: bucketKey(at), href: "/admin/coupons" });
  }
  const currentHour = Number(hourly.format(now)), firstSale = buckets.size ? Math.min(...[...buckets.keys()].map(Number)) : Math.max(0, currentHour - 5);
  const keys = period === "week" ? Array.from({ length: Math.round((Date.parse(dayKey(range.end)) - Date.parse(range.first)) / 86400000) }, (_, i) => shiftDay(range.first, i)) : Array.from({ length: (period === "yesterday" ? 23 : currentHour) - (period === "yesterday" ? 0 : firstSale) + 1 }, (_, i) => String(i + (period === "yesterday" ? 0 : firstSale)).padStart(2, "0"));
  const outputBuckets = keys.map(key => ({ ...(buckets.get(key) ?? { key, store: 0, delivery: 0, count: 0 }), label: period === "week" ? new Intl.DateTimeFormat("en-GB", { timeZone: zone, weekday: "short", day: "numeric" }).format(midnight(key)) : `${key}:00`, fullLabel: period === "week" ? new Intl.DateTimeFormat("en-GB", { timeZone: zone, dateStyle: "full" }).format(midnight(key)) : `${key}:00 – ${String(Number(key) + 1).padStart(2, "0")}:00` }));
  const activityFirst=storeActivity.size?Math.min(...[...storeActivity.keys()].map(Number)):Math.max(0,currentHour-5);
  const activityKeys=period==="week"?keys:Array.from({length:(period==="yesterday"?23:currentHour)-(period==="yesterday"?0:activityFirst)+1},(_,i)=>String(i+(period==="yesterday"?0:activityFirst)).padStart(2,"0"));
  const activityBuckets=activityKeys.map(key=>({key,...(storeActivity.get(key)??{bottles:0,other:0,count:0}),label:period==="week"?new Intl.DateTimeFormat("en-GB",{timeZone:zone,weekday:"short",day:"numeric"}).format(midnight(key)):key+":00",fullLabel:period==="week"?new Intl.DateTimeFormat("en-GB",{timeZone:zone,dateStyle:"full"}).format(midnight(key)):key+":00 – "+String(Number(key)+1).padStart(2,"0")+":00"}));
  events.sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id));
  return { storeActivity:activityBuckets, storeActivityUnclassifiedFils, period, label: range.label, start: range.start.toISOString(), end: cutoff.toISOString(), at: now.toISOString(), status, storeSales, deliverySales, storeCount, deliveryCount, storeCash, deliveryCash, storeClick, deliveryClick, couponSales, couponAwaiting, bookletCash, bookletClick, bookletCount: events.filter(e => e.kind === "booklet").length, buckets: outputBuckets, products: [...products.values()], events: events.slice(0, 2000), eventCount: events.length, partial: status.partial || [sales, delivered, collected, receipts, booklets, financialBooklets, policies, stock, productDefinitions].some(s => s.size > MAX_ROWS) };
}

export { dayKey as ammanDayKey, midnight as ammanMidnight, shiftDay as calendarDay };
