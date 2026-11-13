"use client";
import { userMessage } from "@/lib/client/user-message";
import { useTransientMessage } from "@/lib/client/use-transient-message";
import { usefulOrderSearch } from "@/lib/orders/order-search";
import { useOperationChanges } from "@/lib/client/operation-changes";

import { BottleReturnFields } from "@/components/store/bottle-return-fields";
import type { BottleReturn } from "@/types/inventory";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import styles from "./admin-orders.module.css";
import { AlfanarIcon } from "@/components/admin/alfanar-icon";

type Status = "NEW" | "READY" | "DELIVERED" | "CANCELLED";
type Method = "CASH" | "CLICK" | "COUPON";
type View = "today" | "date" | "recent" | "search";
type Filter = "ALL" | Status;

type Order = {
  inventoryTracked?: boolean;
  returnRequirements?: Array<{ itemId: string; label: string; quantity: number }>;
  bottleReturns?: BottleReturn[];
  previousBottleReturns?: Array<BottleReturn & { label: string }>;
  id: string;
  number: string;
  day: string;
  status: Status;
  customerId: string;
  customerName: string;
  customerPhone: string;
  address: string;
  notes: string;
  createdBy: string;
  items: Array<{
    name: string;
    category: string;
    origin: "JORDANIAN" | "SAUDI" | null;
    quantity: number;
    unitPriceFils: number;
    lineTotalFils: number;
  }>;
  itemCount: number;
  totalFils: number;
  paymentMethod: Method;
  paymentState: string;
  collectedFils: number;
  couponQuantity: number;
  reservedCouponQuantity: number;
  pendingCouponQuantity: number;
  bookletRequestStatus: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  readyAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  history: Array<{
    status: string;
    actorType: string;
    actorName: string;
    reason: string | null;
    at: string | null;
  }>;
};

type Result = {
  success: boolean;
  data?: {
    orders: Order[];
    summary?: { all: number; delivered: number; cancelled: number } | null;
    day: string | null;
    limitReached: boolean;
    hasMore: boolean;
    nextCursor: string | null;
  };
  error?: { message: string; code: string };
};

const statuses: Record<Status, string> = {
  NEW: "جديد",
  READY: "جاهز للتوصيل",
  DELIVERED: "تم التسليم",
  CANCELLED: "ملغي",
};
const paymentLabels: Record<Method, string> = {
  CASH: "نقدي",
  CLICK: "كليك",
  COUPON: "كوبونات",
};
const paymentStateLabels: Record<string, string> = {
  DUE_ON_DELIVERY: "يُحصّل عند التسليم",
  COLLECTED: "تم تحصيل المبلغ",
  PAYMENT_DUE: "مستحق على العميل",
  PARTIALLY_COLLECTED: "تحصيل جزئي",
  COUPONS_RESERVED: "الكوبونات محجوزة",
  COUPONS_SETTLED: "تم استهلاك الكوبونات",
  AWAITING_BOOKLET_APPROVAL: "كوبونات مستحقة على العميل",
  CANCELLED: "ملغي",
};
const bookletLabels: Record<string, string> = {
  REQUESTED: "بانتظار اعتماد الإدارة",
  CANCELLED: "طلب دفتر ملغي",
  APPROVED: "تم اعتماد الدفتر",
};

function money(fils: number) {
  return `${(fils / 1000).toFixed(3)} د.أ`;
}
function jordanDate() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Amman", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const part = (key: string) => parts.find((x) => x.type === key)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
function dateTime(value: string | null, onlyTime = false) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Amman",
    ...(onlyTime ? {} : { year: "numeric", month: "short", day: "numeric" }),
    hour: "2-digit", minute: "2-digit",
  }).format(date);
}
function phoneLocal(phone: string) {
  return /^\+9627\d{8}$/.test(phone) ? `0${phone.slice(4)}` : phone;
}
function errorMessage(data: Result | null) {
  return data?.error?.message ?? "تعذر تنفيذ العملية. حاول مرة أخرى.";
}
function statusLabel(value: string) {
  return statuses[value as Status] ?? value;
}

export default function AdminOrders() {
  const [view, setView] = useState<View>("today");
  const [date, setDate] = useState(jordanDate);
  const [search, setSearch] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const [summary, setSummary] = useState<{ all: number; delivered: number; cancelled: number } | null>(null);
  const readController = useRef<AbortController | null>(null);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [methodFilter, setMethodFilter] = useState<"ALL" | Method>("ALL");
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useTransientMessage(notice, setNotice);
  const [hasMore, setHasMore] = useState(false);
  const [limitReached, setLimitReached] = useState(false);
  const nextCursorRef = useRef<string | null>(null);
  const requestRef = useRef(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, setPending] = useState<"DELIVERED" | "CANCELLED" | null>(null);
  const [, setCancelReason] = useState("");
  const [paymentDeferred,setPaymentDeferred]=useState(false);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (append = false, quiet = false, fresh = false) => {
    const serial = ++requestRef.current;
    readController.current?.abort();
    if ((view === "search" && !usefulOrderSearch(submittedSearch)) || (view === "date" && !date)) {
      setOrders([]);
      setHasMore(false);
      setLoading(false);
      setRefreshing(false);
      setSummary(null);
      return;
    }
    const controller = new AbortController();
    readController.current = controller;
    if (quiet) setRefreshing(true);
    else setLoading(true);
    try {
      const params = new URLSearchParams({ view });
      if (view === "date") params.set("date", date);
      if (view === "search") params.set("q", submittedSearch.trim());
      if (fresh) params.set("refresh", "1");
      if (view === "recent" && append && nextCursorRef.current) {
        params.set("cursor", nextCursorRef.current);
      }
      const response = await fetch(`/api/admin/delivery-orders?${params}`, {
        cache: "no-store", credentials: "same-origin", signal: controller.signal,
      });
      const result = await response.json() as Result;
      if (!response.ok || !result.success || !result.data) throw new Error(errorMessage(result));
      if (serial !== requestRef.current) return;
      const received = result.data.orders;
      setOrders((old) => append ? [
        ...old,
        ...received.filter((order) => !old.some((previous) => previous.id === order.id)),
      ] : received);
      nextCursorRef.current = result.data.nextCursor;
      setHasMore(result.data.hasMore);
      setLimitReached(result.data.limitReached);
      setSummary(result.data.summary ?? null);
      setError("");
    } catch (cause) {
      if (serial === requestRef.current && !controller.signal.aborted) {
        setError(userMessage(cause instanceof Error ? cause.message : "تعذر تحميل الطلبات."));
      }
    } finally {
      if (serial === requestRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [view, date, submittedSearch]);

  useEffect(() => {
    // Run after paint so React effects do not synchronously update state.
    const start = window.setTimeout(() => { void load(); }, 0);
    return () => {
      window.clearTimeout(start);
      requestRef.current += 1;
      readController.current?.abort();
    };
  }, [load, view]);

  useOperationChanges(["orders"], () => { void load(false, true); }, view === "today" && !busy);

  const filtered = useMemo(() => orders.filter((order) =>
    (filter === "ALL" || order.status === filter) &&
    (methodFilter === "ALL" || order.paymentMethod === methodFilter),
  ), [orders, filter, methodFilter]);

  const counts = useMemo(() => ({
    all: orders.length,
    new: orders.filter((o) => o.status === "NEW").length,
    ready: orders.filter((o) => o.status === "READY").length,
    delivered: orders.filter((o) => o.status === "DELIVERED").length,
    cancelled: orders.filter((o) => o.status === "CANCELLED").length,
    due: orders.filter((o) => o.status !== "CANCELLED" && ["DUE_ON_DELIVERY","PAYMENT_DUE","PARTIALLY_COLLECTED"].includes(o.paymentState))
      .reduce((sum, o) => sum + Math.max(0,o.totalFils-o.collectedFils), 0),
    collected: orders.filter((o) => ["COLLECTED","PARTIALLY_COLLECTED"].includes(o.paymentState))
      .reduce((sum, o) => sum + o.collectedFils, 0),
  }), [orders]);

  const selected = filtered.find((order) => order.id === selectedId) ?? filtered[0] ?? null;

  function chooseView(next: View) {
    if (next === view) { void load(false, true, true); return; }
    requestRef.current += 1;
    readController.current?.abort();
    setOrders([]);
    setSummary(null);
    setPending(null);
    setHasMore(false);
    setLimitReached(false);
    setLoading(true);
    setView(next);
    if (next === "search") setSubmittedSearch("");
    setFilter("ALL");
    setMethodFilter("ALL");
    setSelectedId(null);
    setError("");
    setNotice("");
    nextCursorRef.current = null;
  }

  const [bottleReturns, setBottleReturns] = useState<BottleReturn[]>([]);
  function openAction(action: "DELIVERED" | "CANCELLED") {
    if (!selected) return;
    setBottleReturns([]);
    setPending(action);
    setCancelReason("");
    setPaymentDeferred(false);
    setPaymentConfirmed(false);
    setError("");
    setNotice("");
  }

  async function executeAction() {
    if (!selected || !pending || busy) return;

    if (pending === "DELIVERED" && selected.paymentMethod !== "COUPON" && !paymentConfirmed && !paymentDeferred) {
      setError(userMessage("اختر حالة التحصيل أولًا."));
      return;
    }
    if (pending === "DELIVERED" && (selected.returnRequirements ?? []).some(r => !bottleReturns.some(v => v.itemId === r.itemId && Number.isInteger(v.quantity) && v.quantity >= 0 && v.quantity <= r.quantity))) { setError(userMessage("سجّل القوارير الفارغة المستلمة لكل نوع.")); return; }
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/delivery-orders/${encodeURIComponent(selected.id)}/status`, {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pending === "CANCELLED"
          ? { action: "CANCELLED", reason: "إلغاء الطلب من الإدارة" }
          : { action: "DELIVERED", bottleReturns, paymentCollected: selected.paymentMethod === "COUPON" ? false : paymentConfirmed, paymentDeferred: selected.paymentMethod !== "COUPON" && paymentDeferred }),
      });
      const result = await response.json() as Result;
      if (!response.ok || !result.success) throw new Error(errorMessage(result));
      setPending(null);
      setNotice(pending === "CANCELLED"
        ? `تم إلغاء الطلب #${selected.number} وحفظ الإجراء في السجل.`
        : `تم تأكيد تسليم الطلب #${selected.number} وتسجيل العملية.`);
      await load(false, true);
    } catch (cause) {
      setError(userMessage(cause instanceof Error ? cause.message : "تعذر تحديث الطلب."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.page} dir="rtl">
      <header className={styles.hero}>
        <Link className={styles.refreshButton} href="/admin/orders/new"><AlfanarIcon name="plus"/>طلب توصيل جديد</Link>
        <div>
          <div className={styles.eyebrow}><AlfanarIcon name="truck" size={17} /> <span className={styles.liveDot} /> مركز عمليات التوصيل</div>
          <h1>إدارة الطلبات</h1>

        </div>
        <button type="button" className={styles.refreshButton} disabled={loading || refreshing || busy}
          onClick={() => void load(false, true, true)}>
          <AlfanarIcon name="refresh" /> {refreshing ? "جاري التحديث…" : "تحديث الطلبات"}
        </button>
      </header>

      <div className={styles.modeTabs} role="group" aria-label="نطاق الطلبات">
        {([ ["today", "طلبات اليوم"], ["date", "بتاريخ محدد"], ["recent", "السجل الأحدث"], ["search", "بحث شامل"] ] as const)
          .map(([id, label]) => (
            <button key={id} type="button" className={view === id ? styles.activeMode : styles.mode}
              onClick={() => chooseView(id)}>{label}</button>
          ))}
      </div>

      {view === "date" && (
        <div className={styles.searchArea}>
          <label htmlFor="orderDate">اختر تاريخ الطلب</label>
          <input id="orderDate" type="date" value={date} max={jordanDate()} onChange={(event) => { ++requestRef.current; readController.current?.abort(); setOrders([]); setSummary(null); setPending(null); setSelectedId(null); setFilter("ALL"); setMethodFilter("ALL"); setError(""); setNotice(""); setLimitReached(false); setLoading(true); setDate(event.target.value); }} lang="en-GB" />
        </div>
      )}
      {view === "search" && (
        <form className={styles.searchArea} onSubmit={event => {
          event.preventDefault(); if (!usefulOrderSearch(search)) return;
          setFilter("ALL"); setMethodFilter("ALL"); setSelectedId(null); setPending(null); setError("");
          if (submittedSearch === search.trim()) void load(false, true);
          else { setOrders([]); setLoading(true); setSubmittedSearch(search.trim()); }
        }}>
          <label htmlFor="orderSearch">ابحث في جميع التواريخ</label>
          <div className={styles.searchControls}><input id="orderSearch" type="search" value={search} dir="auto"
            onChange={event => { ++requestRef.current; readController.current?.abort(); setSearch(event.target.value); setSubmittedSearch(""); setOrders([]); setSummary(null); setSelectedId(null); setPending(null); setLoading(false); setRefreshing(false); setError(""); setNotice(""); setLimitReached(false); }}
            placeholder="اسم العميل، رقم الهاتف، أو رقم الطلب" />
            <button type="submit" disabled={!usefulOrderSearch(search) || loading}>بحث</button></div>
        </form>
      )}

      {(view !== "search" || !!submittedSearch) && <section className={`${styles.stats} ${view !== "today" ? styles.historyStats : ""}`} aria-label="ملخص الطلبات">
        <div className={styles.statCard}><span>{view === "date" ? "إجمالي طلبات اليوم المحدد" : view === "search" ? "المطابقات المعروضة" : view === "recent" ? "الطلبات المعروضة" : "إجمالي الطلبات"}</span><strong>{loading || error ? "—" : summary?.all ?? counts.all}</strong></div>
        {view === "today" && <><div className={styles.statCard}><span>جديد</span><strong className={styles.blueNumber}>{loading || error ? "—" : counts.new}</strong></div>
        <div className={styles.statCard}><span>جاهز</span><strong className={styles.amberNumber}>{loading || error ? "—" : counts.ready}</strong></div></>}
        <div className={styles.statCard}><span>تم التسليم</span><strong className={styles.greenNumber}>{loading || error ? "—" : summary?.delivered ?? counts.delivered}</strong></div>
        {view !== "today" && <div className={styles.statCard}><span>الطلبات الملغية</span><strong className={styles.cancelledNumber}>{loading || error ? "—" : summary?.cancelled ?? counts.cancelled}</strong></div>}
        {view === "today" && <><div className={styles.statCard}><span>تحصيل مسجّل</span><strong className={styles.moneyNumber}>{loading || error ? "—" : money(counts.collected)}</strong></div>
        <div className={styles.statCard}><span>المتبقي للتحصيل</span><strong className={styles.moneyNumber}>{loading || error ? "—" : money(counts.due)}</strong></div></>}
      </section>}

      <section className={styles.workspace}>
        <div className={styles.listPanel}>
          <div className={styles.listTitle}>
            <div><h2>{view === "search" && submittedSearch ? `نتائج «${submittedSearch}»` : view === "date" ? `طلبات ${date}` : "قائمة الطلبات"}</h2><span>{loading ? "جارٍ التحميل…" : `${filtered.length} طلب ظاهر`}</span></div>

          </div>
          <div className={styles.filters}>
            <label>الحالة
              <select value={filter} onChange={(event) => setFilter(event.target.value as Filter)}>
                <option value="ALL">كل الحالات</option>
                {Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label>الدفع
              <select value={methodFilter} onChange={(event) => setMethodFilter(event.target.value as "ALL" | Method)}>
                <option value="ALL">كل طرق الدفع</option>
                {Object.entries(paymentLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
          </div>

          {limitReached && <div className={styles.warning} role="status">النتائج المعروضة جزئية. ضيّق التاريخ أو البحث.</div>}
          {notice && <div className={styles.success} role="status">{notice}</div>}
          {pending === "DELIVERED" && selected && <BottleReturnFields requirements={selected.returnRequirements ?? []} value={bottleReturns} onChange={setBottleReturns} disabled={busy}/>}
          {error && <div className={styles.error} role="alert">{error}</div>}
          {loading && <div className={styles.empty}>جارٍ تحميل طلبات التوصيل…</div>}
          {!loading && filtered.length === 0 && <div className={styles.empty}>{view === "search" && !submittedSearch ? "اكتب بيانات البحث واضغط «بحث»." : "ما في طلبات مطابقة للخيارات الحالية."}</div>}
          <div className={styles.orderList}>
            {!loading && filtered.map((order) => (
              <button type="button" key={order.id}
                onClick={() => { setSelectedId(order.id); setPending(null); setError(""); }}
                className={`${styles.orderCard} ${selected?.id === order.id ? styles.selectedCard : ""}`}
                aria-pressed={selected?.id === order.id}>
                <div className={styles.cardTop}>
                  <strong>#{order.number}</strong>
                  <span className={`${styles.pill} ${styles[`status${order.status}`]}`}>{statusLabel(order.status)}</span>
                </div>
                <div className={styles.customerName}>{order.customerName}</div>
                <div className={styles.cardDetail}>{order.address}</div>
                <div className={styles.cardBottom}>
                  <span>{dateTime(order.createdAt)}</span>
                  <b>{money(order.totalFils)}</b>
                </div>
              </button>
            ))}
          </div>
          {!loading && view === "recent" && hasMore && (
            <button type="button" className={styles.moreButton} disabled={refreshing || busy} onClick={() => void load(true, true)}>
              {refreshing ? "جارٍ جلب المزيد…" : "تحميل طلبات أقدم"}
            </button>
          )}

        </div>

        <div className={styles.detailPanel}>
          {!selected ? (
            <div className={styles.noSelection}>
              <span aria-hidden="true">▤</span>
              <h2>تفاصيل الطلب</h2>
              <p>لم يتم تحديد طلب.</p>
            </div>
          ) : (
            <>
              <div className={styles.detailHeader}>
                <div><div className={styles.detailLabel}>بطاقة طلب التوصيل</div><h2>طلب #{selected.number}</h2><small>{dateTime(selected.createdAt)}</small></div>
                <span className={`${styles.pill} ${styles[`status${selected.status}`]}`}>{statusLabel(selected.status)}</span>
              </div>
              <div className={styles.customerBox}>
                <div className={styles.sectionHead}><h3>العميل والتوصيل</h3><span>بيانات الطلب وقت التسجيل</span></div>
                <strong className={styles.customerTitle}>{selected.customerName}</strong>
                <p className={styles.address}>⌖ {selected.address}</p>
                <div className={styles.inlineLinks}>
                  <a href={`tel:${selected.customerPhone}`}>اتصال: {phoneLocal(selected.customerPhone)}</a>
                  {selected.customerId && <a href={`/admin/customers/${encodeURIComponent(selected.customerId)}`}>سجل العميل ↗</a>}
                </div>
                {selected.notes && <div className={styles.noteBox}><b>ملاحظات التوصيل:</b> {selected.notes}</div>}
              </div>
              <section className={styles.detailSection}>
                <div className={styles.sectionHead}><h3>تفاصيل المنتجات</h3><span>{selected.itemCount} قطعة</span></div>
                <div className={styles.itemList}>
                  {selected.items.map((item, i) => (
                    <div key={`${i}-${item.name}`} className={styles.itemRow}>
                      <div>
                        <b>{item.name}{item.origin === "JORDANIAN" ? " — أردني" : item.origin === "SAUDI" ? " — سعودي" : ""}</b>
                        <small>{item.quantity} × {money(item.unitPriceFils)}</small>
                      </div>
                      <strong>{money(item.lineTotalFils)}</strong>
                    </div>
                  ))}
                </div>
                <div className={styles.totalRow}><span>إجمالي الطلب</span><strong>{money(selected.totalFils)}</strong></div>
              </section>
              <section className={styles.detailSection}>
                <div className={styles.sectionHead}><h3>الدفع والكوبونات</h3></div>
                <div className={styles.infoGrid}>
                  <div><span>طريقة الدفع</span><b>{paymentLabels[selected.paymentMethod] ?? selected.paymentMethod}</b></div>
                  <div><span>حالة التحصيل</span><b>{paymentStateLabels[selected.paymentState] ?? selected.paymentState}</b></div>
                  {selected.paymentMethod !== "COUPON" && <div><span>مبلغ تم تحصيله</span><b>{money(selected.collectedFils)}</b></div>}
                  {selected.paymentMethod === "COUPON" && <>
                    <div><span>الكوبونات المطلوبة</span><b>{selected.couponQuantity}</b></div>
                    <div><span>المحجوزة من دفاتر نشطة</span><b>{selected.reservedCouponQuantity}</b></div>
                    <div><span>الكوبونات المتبقية</span><b>{selected.pendingCouponQuantity}</b></div>
                  </>}
                  {selected.bookletRequestStatus && <div><span>طلب دفتر جديد</span><b>{bookletLabels[selected.bookletRequestStatus] ?? selected.bookletRequestStatus}</b></div>}
                  <div><span>سجّل الطلب</span><b>{selected.createdBy}</b></div>
                </div>
                {selected.pendingCouponQuantity > 0 && <div className={styles.warning}>المتبقي على العميل: {selected.pendingCouponQuantity} كوبون</div>}
              </section>
              {!!selected.previousBottleReturns?.length && <section className={styles.detailSection}><h3>تسوية قوارير من طلبات سابقة</h3>{selected.previousBottleReturns.map(row => <p key={row.itemId}>{row.label}: {row.quantity}</p>)}</section>}
              {(selected.returnRequirements ?? []).length > 0 && <section className={styles.detailSection}><h3>القوارير الفارغة واستحقاق العميل</h3>{selected.returnRequirements!.map(row => { const received = selected.bottleReturns?.find(v => v.itemId === row.itemId)?.quantity ?? 0; return <div className={styles.noteBox} key={row.itemId}><strong>{row.label}</strong><p>قوارير الطلب: {row.quantity}{selected.status === "DELIVERED" ? ` — المستلم فارغًا: ${received} — النقص المسجل وقت التسليم: ${row.quantity - received}` : " — يُسجّل الاستلام عند التسليم"}</p></div>; })}</section>}

              <section className={styles.detailSection}>
                <div className={styles.sectionHead}><h3>سجل حركة الطلب</h3><span>{selected.history.length} إجراء</span></div>
                <div className={styles.timeline}>
                  {[...selected.history].reverse().map((event, i) => (
                    <div key={`${event.status}-${event.at}-${i}`} className={styles.timelineItem}>
                      <span className={styles.timelineDot} />
                      <div><b>{statusLabel(event.status)}</b><small>{event.actorType === "ADMIN" ? "الإدارة" : `الموظف: ${event.actorName}`} · {dateTime(event.at)}</small>{event.reason && <p>{event.reason}</p>}</div>
                    </div>
                  ))}
                </div>
                {selected.cancelReason && <div className={styles.noteBox}><b>سبب الإلغاء:</b> {selected.cancelReason}</div>}
              </section>
              <section className={styles.actionsPanel}>
                <h3>الإجراءات الإدارية</h3>


                {selected.status === "DELIVERED" && <p>تم تسليم الطلب.</p>}
                {selected.status === "CANCELLED" && <p>الطلب ملغي.</p>}
                <div className={styles.actionButtons}>
                  {selected.status === "READY" && <button type="button" className={styles.deliverButton} disabled={busy} onClick={() => openAction("DELIVERED")}>تأكيد التسليم</button>}
                  {(selected.status === "NEW" || selected.status === "READY") && <button type="button" className={styles.cancelButton} disabled={busy} onClick={() => openAction("CANCELLED")}>إلغاء الطلب</button>}
                </div>
              </section>
            </>
          )}
        </div>
      </section>

      {pending && selected && <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setPending(null); }}>
        <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="modalTitle">
          <div className={styles.modalTop}><h2 id="modalTitle">{pending === "DELIVERED" ? "تأكيد تسليم الطلب" : "إلغاء طلب التوصيل"}</h2><button type="button" aria-label="إغلاق" disabled={busy} onClick={() => setPending(null)}>×</button></div>
          <p>طلب <b>#{selected.number}</b> — {selected.customerName}</p>
          {pending === "CANCELLED" ? <>
            <p className={styles.modalHelp}>سيُلغى الطلب. مواد التعبئة المستهلكة لا تعود للمخزون.</p>

          </> : <>
            <div className={styles.amountBox}>إجمالي الطلب <strong>{money(selected.totalFils)}</strong></div>
            {selected.paymentMethod === "COUPON"
              ? <p className={styles.modalHelp}>سيتم خصم الكوبونات المحجوزة.</p>
              : <label className={styles.checkboxField}>
                  <input type="radio" name="adminCollection" checked={paymentConfirmed} onChange={() => {setPaymentConfirmed(true);setPaymentDeferred(false);}} />
                  أؤكد أنه تم تسليم الطلب واستلام المبلغ بواسطة {paymentLabels[selected.paymentMethod]}.
                </label>}
            {selected.paymentMethod !== "COUPON" && <label className={styles.checkboxField}><input type="radio" name="adminCollection" checked={paymentDeferred} onChange={()=>{setPaymentDeferred(true);setPaymentConfirmed(false);}}/> تم تسليم الطلب والمبلغ باقي على العميل</label>}
          </>}
          {error && <div className={styles.error} role="alert">{error}</div>}
          <div className={styles.modalButtons}>
            <button type="button" className={styles.neutralButton} disabled={busy} onClick={() => { setPending(null); setError(""); }}>رجوع</button>
            <button type="button" className={pending === "CANCELLED" ? styles.cancelButton : styles.deliverButton}
              disabled={busy || (pending === "CANCELLED" ? false : selected.paymentMethod !== "COUPON" && !paymentConfirmed && !paymentDeferred)}
              onClick={() => void executeAction()}>{busy ? "جارٍ الحفظ…" : pending === "CANCELLED" ? "اعتماد الإلغاء" : "اعتماد التسليم"}</button>
          </div>
        </div>
      </div>}
    </main>
  );
}
