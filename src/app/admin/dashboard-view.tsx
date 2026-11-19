"use client";
import { ReceivedEventAmount } from "@/components/admin/received-event-amount";
import { userMessage } from "@/lib/client/user-message";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { DashboardEvent, DashboardOverview, DashboardPeriod, StoreActivityBucket } from "@/types/admin-overview";
import { ShiftHistoryPicker } from "@/components/admin/shift-history-picker";
import { AlfanarIcon } from "@/components/admin/alfanar-icon";
import { useAdminOverview } from "@/components/admin/admin-overview-context";
import styles from "./page.module.css";
const money = (fils: number) => (fils / 1000).toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const time = (at: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Amman", hour: "2-digit", minute: "2-digit", hourCycle: "h23", numberingSystem: "latn" }).format(new Date(at));
const payment = { CASH: "كاش", CLICK: "كليك", COUPON: "كوبونات" };
const source = (event: DashboardEvent) => event.kind === "collection" ? (event.number==="مستحق سابق"?"تحصيل مستحق سابق":`تحصيل طلب #${event.number}`) : event.kind === "booklet" ? "تحصيل دفتر" : event.channel === "store" ? "بيع بالمحل" : `توصيل #${event.number}`;
function Money({ value }: { value: number }) { return <span className={`${styles.money} ${money(value).length > 10 ? styles.longMoney : ""}`}><bdi dir="ltr">{money(value)}</bdi><small>د.أ</small></span>; }

function DashboardDialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const id = useId(), panel = useRef<HTMLElement>(null), close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null, overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden"; panel.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); close.current(); }
      if (e.key !== "Tab") return;
      const nodes = [...(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input,a[href]') ?? [])].filter(n => n.offsetParent !== null);
      if (e.shiftKey && (document.activeElement === nodes[0] || document.activeElement === panel.current)) { e.preventDefault(); nodes.at(-1)?.focus(); }
      else if (!e.shiftKey && document.activeElement === nodes.at(-1)) { e.preventDefault(); nodes[0]?.focus(); }
    };
    document.addEventListener("keydown", key); return () => { document.body.style.overflow = overflow; document.removeEventListener("keydown", key); previous?.focus(); };
  }, []);
  return <div className={styles.overlay} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><section ref={panel} tabIndex={-1} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby={id}><header><h2 id={id}>{title}</h2><button type="button" onClick={onClose} aria-label="إغلاق"><AlfanarIcon name="x"/></button></header>{children}</section></div>;
}

export function SalesChart({ buckets, selected, onSelect }: { buckets: StoreActivityBucket[]; selected: string | null; onSelect: (key: string | null) => void }) {
  const [hover, setHover] = useState<string | null>(null), id = useId().replace(/:/g, "");
  const peak = Math.max(1000, ...buckets.flatMap(b => [b.bottles, b.other])) / 1000, raw = peak / 3, power = 10 ** Math.floor(Math.log10(raw)), step = ([1, 2, 2.5, 4, 5, 10].find(n => n * power >= raw) ?? 10) * power, ceiling = step * 3 * 1000;
  const width = 800, left = 52, graphWidth = width - left - 14, height = 220, top = 34, base = top + height, group = graphWidth / Math.max(1, buckets.length), bar = Math.min(39, group * .31);
  const activeKey = hover ?? selected, activeIndex = buckets.findIndex(b => b.key === activeKey), active = buckets[activeIndex];
  return <div className={styles.chartScroll}><div className={styles.chartCanvas}>
    <svg viewBox="0 0 800 304" className={styles.chart} role="group" aria-label="حركة بيع المحل: الأزرق للتعبئة والقوارير الجديدة والأخضر للمنتجات الأخرى" style={{ direction: "ltr" }}>
      <defs><linearGradient id={`${id}-store`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#54a6ff"/><stop offset="1" stopColor="#1767e6"/></linearGradient><linearGradient id={`${id}-delivery`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#57e9db"/><stop offset="1" stopColor="#00a99c"/></linearGradient></defs>
      <text x="43" y="16" textAnchor="end" className={styles.axis}>د.أ</text>
      {[0, 1, 2, 3].map(i => <g key={i}><line x1={left} x2={788} y1={base - i * height / 3} y2={base - i * height / 3} className={styles.gridLine}/><text x={left - 12} y={base - i * height / 3 + 4} textAnchor="end" className={styles.axis}>{(step * i).toLocaleString("en-US", { maximumFractionDigits: 3 })}</text></g>)}
      {buckets.map((b, index) => {
        const center = left + group * (index + .5), h1 = b.bottles / ceiling * height, h2 = b.other / ceiling * height, highlighted = b.key === activeKey;
        return <g key={b.key} className={styles.barGroup} role="button" tabIndex={0} aria-label={`${b.fullLabel}: التعبئة والقوارير ${money(b.bottles)}، المنتجات الأخرى ${money(b.other)} دينار. اضغط لعرض العمليات.`} aria-pressed={b.key === selected} onMouseEnter={() => setHover(b.key)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(b.key)} onBlur={() => setHover(null)} onClick={() => onSelect(selected === b.key ? null : b.key)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(selected === b.key ? null : b.key); } }}>
          {highlighted && <rect x={center - group * .46} y={20} width={group * .92} height={base - 10} rx="9" className={styles.highlight}/>}
          {b.bottles > 0 && <rect x={center - bar - 2} y={base - h1} width={bar} height={h1} rx="6" fill={`url(#${id}-store)`}/>}
          {b.other > 0 && <rect x={center + 2} y={base - h2} width={bar} height={h2} rx="6" fill={`url(#${id}-delivery)`}/>}
          {buckets.length <= 9 && b.bottles > 0 && <text x={center - bar / 2 - 2} y={base - h1 - 8} className={styles.valueLabel} textAnchor="middle">{(b.bottles / 1000).toLocaleString("en-US", { maximumFractionDigits: 3 })}</text>}
          {buckets.length <= 9 && b.other > 0 && <text x={center + bar / 2 + 2} y={base - h2 - 8} className={styles.valueLabel} textAnchor="middle">{(b.other / 1000).toLocaleString("en-US", { maximumFractionDigits: 3 })}</text>}
          {(buckets.length <= 12 || index % 3 === 0 || index === buckets.length - 1) && <text x={center} y={base + 25} textAnchor="middle" className={styles.axis}>{b.label}</text>}
          <rect x={center - group * .48} y="20" width={group * .96} height={base + 30} rx="7" className={styles.hit}/>
        </g>;
      })}
    </svg>
    {active && <div className={styles.tooltip} style={{ left: `${Math.min(84, Math.max(17, (left + group * (activeIndex + .5)) / width * 100))}%` }}><strong>{active.fullLabel}</strong><span><i className={styles.blueDot}/>التعبئة والقوارير <bdi>{money(active.bottles)}</bdi></span><span><i className={styles.tealDot}/>المنتجات الأخرى <bdi>{money(active.other)}</bdi></span><b>الإجمالي <bdi>{money(active.bottles + active.other)}</bdi> د.أ</b></div>}
    {!buckets.some(b => b.bottles || b.other) && <div className={styles.chartEmpty}>لا توجد مبيعات داخل المحل في هذه الفترة بعد.</div>}
  </div></div>;
}

export default function DashboardView({ initialData }: { initialData: DashboardOverview | null }) {
  const [shiftId,setShiftId]=useState("");
  const [period, setPeriod] = useState<DashboardPeriod>(initialData?.period ?? "shift"), [data, setData] = useState(initialData), [refreshing, setRefreshing] = useState(false), [error, setError] = useState(""), [selected, setSelected] = useState<string | null>(null), [ranking, setRanking] = useState<"quantity" | "value">("quantity"), [dialog, setDialog] = useState<"collections" | "events" | null>(null), [detail, setDetail] = useState<DashboardEvent | null>(null), [logQuery, setLogQuery] = useState(""), [logLimit, setLogLimit] = useState(40);
  const pathname = usePathname(), lastLoad = useRef(0);
  const request = useRef(0), controller = useRef<AbortController | null>(null), overview = useAdminOverview(), setHeader = overview?.setStatus;
  const load = useCallback(async (value: DashboardPeriod) => {
    lastLoad.current = Date.now();
    const token = ++request.current; controller.current?.abort(); const current = new AbortController(); controller.current = current; setRefreshing(true);
    try {
      const response = await fetch(`/api/admin/dashboard?period=${value}${shiftId?"&shiftId="+encodeURIComponent(shiftId):""}`, { cache: "no-store", signal: current.signal }), result = await response.json();
      if (!response.ok || !result.success) throw Error(result.error?.message ?? "تعذر تحديث اللوحة.");
      if (token !== request.current) return;
      const next = result.data as DashboardOverview; setData(next); setHeader?.(next.status); setError(""); setSelected(previous => previous && next.storeActivity?.some(b => b.key === previous) ? previous : null);
    } catch (cause) { if (token === request.current && !current.signal.aborted) setError(userMessage(cause instanceof Error ? cause.message : "تعذر الاتصال.")); }
    finally { if (token === request.current) setRefreshing(false); }
  }, [setHeader,shiftId]);
  const stopRequests = useCallback(() => { ++request.current; controller.current?.abort(); }, []);
  useEffect(() => {
    if (pathname !== "/admin") return;
    const timer = window.setTimeout(() => { if (document.visibilityState === "visible") void load(period); }, 0);
    // Cheap browser clock only. Network reads happen after ten full minutes
    // since the latest entry, manual refresh or period selection.
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible" && Date.now() - lastLoad.current >= 600000) void load(period);
    }, 10000);
    const visible = () => { if (document.visibilityState === "visible" && Date.now() - lastLoad.current >= 600000) void load(period); };
    document.addEventListener("visibilitychange", visible);
    return () => { window.clearTimeout(timer); window.clearInterval(interval); document.removeEventListener("visibilitychange", visible); stopRequests(); };
  }, [period, pathname, load, stopRequests]);
  const shown = data?.period === period && (period !== "shift" || !shiftId || data.selectedShiftId === shiftId) ? data : null, chosen = shown?.storeActivity?.find(b => b.key === selected), events = (shown?.events ?? []).filter(e => !chosen || (e.bucket === chosen.key && e.channel === "store" && e.kind === "sale")), top = [...(shown?.products ?? [])].sort((a, b) => b[ranking] - a[ranking] || a.name.localeCompare(b.name, "ar")).slice(0, 3), maximum = top[0]?.[ranking] ?? 0;
  const matchingEvents = events.filter(e => `${source(e)} ${e.employee} ${e.number} ${payment[e.payment]} ${(e.items ?? []).map(i => i.name).join(" ")}`.includes(logQuery.trim()));
  function selectPeriod(value: DashboardPeriod) { setShiftId(""); setPeriod(value); setSelected(null); setError(""); setLogLimit(40); }
  function eventRow(event: DashboardEvent) {
    return <button type="button" key={event.id} className={styles.event} onClick={() => setDetail(event)}><span className={`${styles.channel} ${event.channel === "store" ? styles.store : styles.delivery}`}><AlfanarIcon name={event.kind === "booklet" ? "ticket" : event.channel === "store" ? "store" : "truck"} size={17}/>{source(event)}</span><span className={styles.method}>{event.deferred?"باقي على العميل":payment[event.payment]}</span><span className={styles.employee}><AlfanarIcon name="user" size={14}/>{event.employee}</span><time className={styles.eventTime} dateTime={event.at}>{time(event.at)}</time><ReceivedEventAmount event={event} renderMoney={value=><Money value={value}/>}/></button>;
  }
  return <div className={styles.dashboard} dir="rtl">
    <header className={styles.toolbar}><h1>نظرة على {shown?.label ?? (period === "shift" ? "الشفت" : period === "today" ? "اليوم" : period === "yesterday" ? "أمس" : "آخر 7 أيام")}</h1><div className={styles.tools}><button type="button" className={styles.refresh} disabled={refreshing} onClick={() => void load(period)} aria-label="تحديث اللوحة"><AlfanarIcon name="refresh" size={20}/></button><span className={`${styles.updated} ${error ? styles.stale : ""}`}>{refreshing ? "جارٍ التحديث…" : shown ? <><i/>{error ? "آخر قراءة" : "آخر تحديث"} {time(shown.at)}</> : "جارٍ تحميل البيانات…"}</span><div className={styles.segment}>{([["shift", "الشفت"], ["today", "اليوم"], ["yesterday", "أمس"], ["week", "آخر 7 أيام"]] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={period === value} onClick={() => selectPeriod(value)}>{label}</button>)}</div></div></header>
    {period==="shift"&&data?.shifts&&<section className={styles.shiftToolbar} aria-label="اختيار الشفت"><ShiftHistoryPicker shifts={data.shifts} selectedId={shiftId||data.selectedShiftId||""} disabled={refreshing} onSelect={id=>{setShiftId(id);setSelected(null);}}/><div className={styles.shiftExpected}><span>الكاش المتوقع</span>{shown?<Money value={shown.expectedCashFils??0}/>:<strong>—</strong>}</div><div className={styles.segment} aria-label="نوع الشفت">{(["MORNING","EVENING"] as const).map(type=>{const workDay=data.shifts?.find(s=>s.id===(shiftId||data.selectedShiftId))?.workDay??data.shifts?.[0]?.workDay;const target=data.shifts?.find(s=>s.shiftType===type&&s.workDay===workDay);return <button key={type} type="button" disabled={!target||refreshing} aria-pressed={!!target&&(shiftId||data.selectedShiftId)===target.id} onClick={()=>{if(target){setShiftId(target.id);setSelected(null);}}}><AlfanarIcon name={type==="MORNING"?"sun":"moon"}/>{type==="MORNING"?"الصباحي":"المسائي"}</button>;})}</div></section>}
    {error && <div className={styles.error} role="alert">{error} {shown ? `آخر قراءة ناجحة ${time(shown.at)}.` : "لم تُحمّل أرقام هذه الفترة."}<button onClick={() => void load(period)}>إعادة المحاولة</button></div>}
    {!shown ? <div className={styles.skeleton} aria-busy={!error}><AlfanarIcon name="bars" size={38}/><p>{error ? "تحتاج اللوحة قراءة ناجحة لعرض الأرقام." : "جارٍ تجهيز المبيعات والتحصيل…"}</p></div> : <>
      {shown.partial && <p className={styles.warning} role="status">البيانات المعروضة جزئية.</p>}
      <section className={styles.kpis} aria-label="ملخص الفترة">
        <article className={styles.kpi}><div><h2>مبيعات {shown.label}</h2><AlfanarIcon name="coins" size={28}/></div><Money value={shown.storeSales + shown.deliverySales}/><p>المحل <bdi>{money(shown.storeSales)}</bdi> · التوصيل <bdi>{money(shown.deliverySales)}</bdi></p></article>
        <article className={styles.kpi}><div><h2>كاش المحل</h2><AlfanarIcon name="store" size={28}/></div><Money value={shown.storeCash}/></article>
        <article className={`${styles.kpi} ${styles.teal}`}><div><h2>كاش التوصيل</h2><AlfanarIcon name="truck" size={30}/></div><Money value={shown.deliveryCash}/></article>
        <article className={styles.kpi}><div><h2>عمليات مكتملة</h2><AlfanarIcon name="check" size={26}/></div><strong className={styles.count}>{shown.storeCount + shown.deliveryCount}</strong><p>{shown.storeCount} بالمحل · {shown.deliveryCount} توصيل</p></article>
      </section>
      <section className={styles.paymentStrip} aria-label="الدفع والتحصيل"><span><AlfanarIcon name="card"/>كليك / تحويل <bdi>{money(shown.storeClick + shown.deliveryClick)}</bdi> د.أ</span><span><AlfanarIcon name="ticket"/>الكوبونات المستخدمة <bdi>{shown.couponCount}</bdi> كوبون {shown.couponPendingCount > 0 && <small>({shown.couponPendingCount} كوبون مستحق)</small>}</span>{shown.status.pendingCollectionCount > 0 && <Link className={styles.pending} href="/admin/orders"><AlfanarIcon name="info"/>بانتظار التحصيل الآن: {shown.status.pendingCollectionCount} طلبات · <bdi>{money(shown.status.pendingCollectionFils)}</bdi> د.أ</Link>}<button type="button" onClick={() => setDialog("collections")}>تفاصيل التحصيل <AlfanarIcon name="arrow-left" size={17}/></button></section>
      {period==="shift" && shown.cashCount?.closed && <section className={styles.cashBreakdown} aria-label="تسليم الشفت">{([{label:"الورقي",value:shown.cashCount.banknotesFils},{label:"المعدني",value:shown.cashCount.coinsFils},{label:"الكاش المسلم",value:shown.cashCount.actualCashFils},{label:"الأجرة المدفوعة",value:shown.cashCount.wagePaidFils},{label:"الفرق",value:shown.cashCount.differenceFils}]).map(item=><div key={item.label}><span>{item.label}</span>{item.value===null?<strong>—</strong>:<Money value={item.value}/>}</div>)}</section>}
      <div className={styles.middle}>
        <section className={styles.panel}><header className={styles.panelHeading}><div><h2><AlfanarIcon name="bars"/>حركة البيع</h2><p>{period === "today" ? "بيع داخل المحل من بداية اليوم حتى الآن" : `بيع داخل المحل خلال ${shown.label}`}</p></div><div className={styles.legend}><span><i className={styles.blueDot}/>التعبئة والقوارير</span><span><i className={styles.tealDot}/>المنتجات الأخرى</span></div></header><SalesChart buckets={shown.storeActivity??[]} selected={selected} onSelect={setSelected}/><footer className={styles.chartFooter}>{chosen && <button type="button" onClick={() => setSelected(null)}>إلغاء التحديد</button>}{shown.events.find(e=>e.channel==="store"&&e.kind==="sale") && <span className={styles.last}>آخر بيع بالمحل {time(shown.events.find(e=>e.channel==="store"&&e.kind==="sale")!.at)}</span>}</footer>{!!shown.storeActivityUnclassifiedFils && <p className={styles.note}>مبيعات قديمة بقيمة {money(shown.storeActivityUnclassifiedFils)} د.أ تحتاج تصنيف صنفها لعرضها بالمخطط؛ قيمتها محفوظة في الإجماليات.</p>}</section>
        <section className={styles.panel}><header className={styles.panelHeading}><h2>الأكثر مبيعًا</h2><div className={styles.segment}><button type="button" aria-pressed={ranking === "quantity"} onClick={() => setRanking("quantity")}>الكمية</button><button type="button" aria-pressed={ranking === "value"} onClick={() => setRanking("value")}>القيمة</button></div></header><div className={styles.products}>{top.map((p, index) => <article key={p.id}><div><span className={styles.rank}>{index + 1}</span><strong>{p.name}</strong></div><p>{ranking === "quantity" ? `${p.quantity} ${p.unit}` : <Money value={p.value}/>}</p><div className={styles.productTrack}><i style={{ width: `${maximum > 0 ? p[ranking] / maximum * 100 : 0}%` }}/></div></article>)}{!top.length && <p className={styles.empty}>تظهر المنتجات بعد تسجيل المبيعات.</p>}</div></section>
      </div>
      <div className={styles.bottom}><section className={styles.panel}><header className={styles.panelHeading}><div><h2><AlfanarIcon name="activity"/>آخر العمليات</h2>{chosen && <p>{chosen.fullLabel} · {chosen.count} عمليات بيع</p>}</div><button type="button" className={styles.textButton} onClick={() => { setLogQuery(""); setLogLimit(40); setDialog("events"); }}>عرض السجل <AlfanarIcon name="arrow-left" size={16}/></button></header><div className={styles.events}>{events.slice(0, 3).map(eventRow)}{!events.length && <p className={styles.empty}>لا توجد عمليات في الفترة المحددة.</p>}</div></section><section className={styles.panel}><header className={styles.panelHeading}><h2><AlfanarIcon name="info"/>يحتاج انتباهك</h2></header><div className={styles.attention}>{shown.status.pendingCount > 0 && <Link href="/admin/orders"><AlfanarIcon name="truck"/><span>طلبات تنتظر التسليم</span><b>{shown.status.pendingCount}</b><AlfanarIcon name="arrow-left" size={16}/></Link>}{shown.status.lowStockCount > 0 && <Link href="/admin/inventory"><AlfanarIcon name="package"/><span>أصناف تحت حد التنبيه</span><b>{shown.status.lowStockCount}</b><AlfanarIcon name="arrow-left" size={16}/></Link>}{shown.status.owedBottles > 0 && <Link href="/admin/inventory?tab=debts"><AlfanarIcon name="coins"/><span>قوارير مستحقة على العملاء</span><b>{shown.status.owedBottles}</b><AlfanarIcon name="arrow-left" size={16}/></Link>}{!shown.status.pendingCount && !shown.status.lowStockCount && !shown.status.owedBottles && <p className={styles.empty}><AlfanarIcon name="check"/>لا توجد تنبيهات تشغيلية الآن.</p>}</div></section></div>

    </>}
    {dialog && shown && !detail && <DashboardDialog title={dialog === "collections" ? `تفاصيل التحصيل — ${shown.label}` : `سجل العمليات — ${chosen?.fullLabel ?? shown.label}`} onClose={() => setDialog(null)}>{dialog === "collections" ? <><table className={styles.financial}><thead><tr><th>المصدر</th><th>كاش</th><th>كليك / تحويل</th></tr></thead><tbody><tr><th>داخل المحل</th><td><Money value={shown.storeCash}/></td><td><Money value={shown.storeClick}/></td></tr><tr><th>التوصيل</th><td><Money value={shown.deliveryCash}/></td><td><Money value={shown.deliveryClick}/></td></tr><tr><th>الإجمالي المحصّل</th><td><Money value={shown.storeCash + shown.deliveryCash}/></td><td><Money value={shown.storeClick + shown.deliveryClick}/></td></tr></tbody></table><div className={styles.collectionNote}><p>من التحصيل أعلاه: {shown.bookletCount} دفاتر، كاش <bdi>{money(shown.bookletCash)}</bdi> د.أ وكليك <bdi>{money(shown.bookletClick)}</bdi> د.أ.</p><p>الكوبونات المستخدمة: {shown.couponCount} · المستحقة: {shown.couponPendingCount}</p></div></> : <><input className={styles.logSearch} placeholder="بحث بالموظف أو رقم الطلب أو الصنف" aria-label="البحث في العمليات" value={logQuery} onChange={e => { setLogQuery(e.target.value); setLogLimit(40); }}/><p className={styles.note}>{shown.eventCount > shown.events.length ? `المعروض آخر ${shown.events.length} عملية.` : null}</p><div className={styles.events}>{matchingEvents.slice(0, logLimit).map(eventRow)}{!matchingEvents.length && <p className={styles.empty}>لا توجد عمليات مطابقة.</p>}</div>{matchingEvents.length > logLimit && <button className={styles.textButton} onClick={() => setLogLimit(logLimit + 40)}>عرض المزيد</button>}</>}</DashboardDialog>}
    {detail && <DashboardDialog title={source(detail)} onClose={() => setDetail(null)}><div className={styles.operationDetails}><ReceivedEventAmount event={detail} renderMoney={value=><Money value={value}/>}/><p>{detail.employee} · {payment[detail.payment]} · {new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Amman", dateStyle: "medium", timeStyle: "short" }).format(new Date(detail.at))}</p>{detail.items?.map((item, i) => <div key={i}><span>{item.name} × {item.quantity}</span><Money value={item.value}/></div>)}{(detail.channel === "delivery"||detail.kind==="collection") && <Link href={detail.href}>فتح {detail.kind === "collection"?"حساب العميل":detail.kind === "booklet" ? "الكوبونات" : "طلبات التوصيل"} <AlfanarIcon name="arrow-left" size={17}/></Link>}</div></DashboardDialog>}
  </div>;
}
