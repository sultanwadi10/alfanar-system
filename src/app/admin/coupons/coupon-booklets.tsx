"use client";
import { userMessage } from "@/lib/client/user-message";
import { useTransientMessage } from "@/lib/client/use-transient-message";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlfanarIcon } from "@/components/admin/alfanar-icon";
import styles from "./coupon-booklets.module.css";
import ActionModal from "@/components/ui/action-modal";

type Booklet = {
  id: string; serial: string; status: "IN_STOCK" | "ACTIVE" | "EXHAUSTED";
  customerId: string | null; orderId: string | null;
  issuedCoupons: number; remainingCoupons: number; reservedCoupons: number;
  createdAt: string | null; activatedAt: string | null;
};
type Request = {
  orderId: string; orderNumber: string; customerId: string; customerName: string;
  status: string; requestStatus: string; pendingCoupons: number;
  priceFils: number | null; paymentMethod: string | null;
};
type Sale = {
  orderId: string; customerId: string; employeeName: string; channel?:string; serial?:string; financialDate?:string; financialPeriod?:string;
  priceFils: number; paymentMethod: string; createdAt: string | null;
};
type Data = {
  priceFils: number | null; booklets: Booklet[]; requests: Request[];
  sales: Sale[]; truncated: boolean; hasMore: boolean; nextCursor: string | null;
};
function amount(value: number) { return `${(value / 1000).toFixed(3)} د.أ`; }
function when(value: string | null) {
  return value ? new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Amman", dateStyle: "medium", timeStyle: "short",
  }).format(new Date(value)) : "—";
}
function errorText(value: unknown) {
  if (value && typeof value === "object" && "error" in value) {
    const err = value.error;
    if (err && typeof err === "object" && "message" in err && typeof err.message === "string") return err.message;
  }
  return "تعذّر إتمام العملية.";
}
const statusLabels: Record<string, string> = {
  IN_STOCK: "غير مباع — بالمخزون", ACTIVE: "نشط عند عميل", EXHAUSTED: "مستهلك بالكامل",
  REQUESTED: "بانتظار تسليم الموظف", HANDED_OVER: "تم التسليم والتحصيل — بانتظار اعتماد الرقم",
  APPROVED: "معتمد",
};
function priceToFils(raw: string) {
  const input = raw.trim();
  if (!/^(0|[1-9]\d{0,5})(\.\d{1,3})?$/.test(input)) return null;
  const [dinars, decimals = ""] = input.split(".");
  const fils = Number(dinars) * 1000 + Number(decimals.padEnd(3, "0"));
  return fils >= 1 && fils <= 1_000_000 ? fils : null;
}

export default function CouponBooklets() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  useTransientMessage(success, setSuccess);
  const [priceInput, setPriceInput] = useState("");
  const [conversion,setConversion]=useState<{total:number;changes:Array<{id:string;before:string;after:string}>;conflicts:Array<{serial:string;existing:string[]}>}|null>(null);
  const [serial, setSerial] = useState("");
  const [search, setSearch] = useState("");
  const [approveSelection, setApproveSelection] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState("ALL");
  const [confirmDialog, setConfirmDialog] = useState<
    | { kind: "PRICE"; priceFils: number }
    | { kind: "APPROVE"; orderId: string; orderNumber: string; customerName: string; pendingCoupons: number; bookletId: string; serial: string }
    | null
  >(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const response = await fetch("/api/admin/coupon-booklets", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(errorText(result));
      const incoming = result.data as Data;
      setData(incoming);
      if (!quiet) setPriceInput(incoming.priceFils === null ? "" : (incoming.priceFils / 1000).toFixed(3));
      setError("");
    } catch (cause) {
      setError(userMessage(cause instanceof Error ? cause.message : "تعذّر تحميل الدفاتر."));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function loadMore() {
    if (moreLoading || !data?.nextCursor) return;
    setMoreLoading(true);
    try {
      const response = await fetch(`/api/admin/coupon-booklets?cursor=${data.nextCursor}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(errorText(result));
      const next = result.data as Data;
      setData(old => old ? {
        ...old,
        booklets: [...old.booklets, ...next.booklets.filter(item => !old.booklets.some(b => b.id === item.id))],
        hasMore: next.hasMore,
        nextCursor: next.nextCursor,
      } : next);
    } catch (cause) {
      setError(userMessage(cause instanceof Error ? cause.message : "تعذر تحميل باقي الدفاتر."));
    } finally { setMoreLoading(false); }
  }

  const stock = useMemo(() => data?.booklets.filter(b => b.status === "IN_STOCK") ?? [], [data]);
  const shown = useMemo(() => (data?.booklets ?? []).filter(b => {
    if (filter !== "ALL" && b.status !== filter) return false;
    const q = search.trim().toLowerCase();
    return !q || b.serial.toLowerCase().includes(q) || (b.customerId ?? "").toLowerCase().includes(q) || (b.orderId ?? "").toLowerCase().includes(q);
  }), [data, filter, search]);
  const stats = useMemo(() => ({
    total: data?.booklets.length ?? 0, inStock: stock.length,
    active: data?.booklets.filter(b => b.status === "ACTIVE").length ?? 0,
    reserved: data?.booklets.reduce((sum, b) => sum + b.reservedCoupons, 0) ?? 0,
    remaining: data?.booklets.reduce((sum, b) => sum + b.remainingCoupons, 0) ?? 0,
    pending: data?.requests.filter(r => r.requestStatus === "HANDED_OVER").length ?? 0,
  }), [data, stock]);

  async function send(url: string, body: unknown, successText: string) {
    if (busy) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      const response = await fetch(url, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(errorText(result));
      setSuccess(successText);
      await load(true);
      return true;
    } catch (cause) {
      setError(userMessage(cause instanceof Error ? cause.message : "تعذر حفظ البيانات."));
      return false;
    } finally { setBusy(false); }
  }

  function savePrice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fils = priceToFils(priceInput);
    if (fils === null) { setError(userMessage("أدخل سعر الدفتر بالدينار مثل 10.500.")); return; }
    setError("");
    setConfirmDialog({ kind: "PRICE", priceFils: fils });
  }
  async function previewSerials(){setBusy(true);setError("");try{const response=await fetch("/api/admin/coupon-booklets/serials",{cache:"no-store"});const result=await response.json();if(!response.ok||!result.success)throw Error(errorText(result));setConversion(result.data);}catch(cause){setError(userMessage(cause instanceof Error?cause.message:"تعذرت المعاينة."));}finally{setBusy(false);}}
  async function convertSerials(){if(!conversion||conversion.conflicts.length)return;setBusy(true);try{const response=await fetch("/api/admin/coupon-booklets/serials",{method:"POST"});const result=await response.json();if(!response.ok||!result.success)throw Error(errorText(result));setSuccess("تم تحديث أرقام الدفاتر.");setConversion(null);await load(true);}catch(cause){setError(userMessage(cause instanceof Error?cause.message:"تعذّر التحويل."));}finally{setBusy(false);}}
  async function addBooklet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = serial.trim().toUpperCase();
    if (!/^[0-9٠-٩۰-۹]{1,40}$/.test(value)) {setError(userMessage("أدخل رقم الدفتر الفعلي مثل 1 أو 125."));return;}
    if (await send("/api/admin/coupon-booklets", { action: "ADD", serial: value }, `تم تسجيل الدفتر ${value} في المخزون.`)) setSerial("");
  }
  function approve(request: Request) {
    const bookletId = approveSelection[request.orderId];
    const booklet = stock.find(b => b.id === bookletId);
    if (!booklet) { setError(userMessage("اختر رقم دفتر فعليًا موجودًا بالمخزون.")); return; }
    setError("");
    setConfirmDialog({ kind: "APPROVE", orderId: request.orderId, orderNumber: request.orderNumber,
      customerName: request.customerName, pendingCoupons: request.pendingCoupons, bookletId: booklet.id, serial: booklet.serial });
  }
  async function commitConfirmation() {
    if (!confirmDialog || busy) return;
    const confirmed = confirmDialog;
    const success = confirmed.kind === "PRICE"
      ? await send("/api/admin/coupon-booklets", { action: "PRICE", priceFils: confirmed.priceFils }, "تم تحديث السعر المعتمد للدفاتر الجديدة.")
      : await send(`/api/admin/coupon-booklets/${confirmed.bookletId}/approve`, { orderId: confirmed.orderId }, "تم اعتماد الرقم التسلسلي وربط الدفتر بالعميل وتسوية الكوبونات المعلقة.");
    if (success) setConfirmDialog(null);
  }

  return <main className={styles.page} dir="rtl">
    <header className={styles.hero}>
      <div><span className={styles.heroEyebrow}><AlfanarIcon name="shield" /> نظام الفنار • إدارة الكوبونات</span><h1>الدفاتر المرقّمة</h1>
        </div>
      <button onClick={() => void load(true)} disabled={busy || loading}><AlfanarIcon name="refresh" /> تحديث البيانات</button>
    </header>
    <section className={styles.stats} aria-label="مؤشرات الدفاتر">
      {[
        ["إجمالي الدفاتر الظاهرة", stats.total, "book"],
        ["متاحة بالمخزون", stats.inStock, "package"],
        ["دفاتر نشطة", stats.active, "ticket"],
        ["بانتظار اعتماد الإدارة", stats.pending, "clock"],
      ].map(([label, value, icon]) => <div key={label}>
        <span><AlfanarIcon name={icon as "book" | "package" | "ticket" | "clock"} /> {label}</span>
        <strong>{value}</strong>
      </div>)}
    </section>
    {error && <div className={styles.error} role="alert">{error}</div>}
    {success && <div className={styles.success} role="status">{success}</div>}
    {data?.truncated && <div className={styles.notice}>النتائج المعروضة جزئية. ضيّق البحث لعرض بقية السجلات.</div>}
    <section className={styles.controls}>
      <form onSubmit={(e) => void savePrice(e)} className={styles.panel}>
        <h2><AlfanarIcon name="coins" /> سعر دفتر الـ22 كوبون</h2>

        <div className={styles.formRow}><label>سعر الدفتر بالدينار الأردني<input value={priceInput} onChange={e => setPriceInput(e.target.value)} inputMode="decimal" placeholder="0.000" required /></label>
        <button type="submit" disabled={busy}>حفظ السعر</button></div>
        <small>السعر الحالي: {data?.priceFils == null ? "غير محدد" : amount(data.priceFils)} · كل دفتر = 22 كوبونًا.</small>
      </form>
      <form onSubmit={(e) => void addBooklet(e)} className={styles.panel}>
        <h2><AlfanarIcon name="book" /> إدخال دفتر إلى المخزون</h2>

        <div className={styles.formRow}><label>الرقم التسلسلي<input value={serial} onChange={e => setSerial(e.target.value)} placeholder="مثال: 1 أو 125" inputMode="numeric" maxLength={40} dir="ltr" required /></label>
        <button type="submit" disabled={busy}>+ إضافة للمخزون</button></div>

      </form>
    </section>
    <section className={styles.panel}>
      <div className={styles.panelTitle}><div><h2><AlfanarIcon name="truck" /> طلبات الدفاتر من التوصيل</h2></div><b>{data?.requests.length ?? 0}</b></div>
      {loading ? <p className={styles.empty}>جاري التحميل...</p> : !data?.requests.length ? <p className={styles.empty}>لا توجد طلبات دفاتر معلّقة.</p>
      : <div className={styles.requests}>{data.requests.map(req => <article className={styles.request} key={req.orderId}>
        <div className={styles.requestInfo}>
          <span className={styles.requestBadge}>{statusLabels[req.requestStatus] ?? req.requestStatus}</span>
          <h3>طلب #{req.orderNumber} — {req.customerName}</h3>
          <p>حالة الطلب: {req.status === "DELIVERED" ? "تم التسليم" : req.status === "READY" ? "جاهز" : "جديد"} · كوبونات الطلب المعلقة: <b>{req.pendingCoupons}</b></p>
          <div className={styles.links}><Link href={`/admin/customers/${encodeURIComponent(req.customerId)}`}>ملف العميل</Link><Link href="/admin/orders">إدارة الطلبات</Link></div>
          {req.requestStatus === "HANDED_OVER" && <small>سعر الدفتر المحصّل: {amount(req.priceFils ?? 0)} ({req.paymentMethod === "CLICK" ? "كليك" : "كاش"})</small>}
        </div>
        <div className={styles.approveBox}>
          {req.requestStatus === "HANDED_OVER" ? <>
            <label>اختيار الرقم التسلسلي<select value={approveSelection[req.orderId] ?? ""} disabled={busy} onChange={e => setApproveSelection(old => ({ ...old, [req.orderId]: e.target.value }))}>
              <option value="">اختر دفترًا من المخزون</option>
              {stock.map(b => <option key={b.id} value={b.id}>{b.serial}</option>)}
            </select></label>
            <button disabled={busy || !approveSelection[req.orderId]} onClick={() => void approve(req)}>اعتماد الدفتر وربطه بالعميل</button>
          </> : <p>بانتظار أن يؤكد الموظف تسليم الدفتر وقبض ثمنه من طلبات اليوم.</p>}
        </div>
      </article>)}</div>}
    </section>
    <section className={styles.panel}>
      <div className={styles.panelTitle}><div><h2><AlfanarIcon name="book" /> سجل الدفاتر الفعلية</h2></div><span>{shown.length} ظاهر</span></div>
      <div className={styles.searchRow}><input type="search" aria-label="بحث تسلسلي" value={search} onChange={e => setSearch(e.target.value)} placeholder="رقم دفتر، معرف عميل أو طلب..." />
        <select aria-label="فلترة حالة الدفاتر" value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="ALL">جميع الحالات</option><option value="IN_STOCK">في المخزون</option><option value="ACTIVE">نشط</option><option value="EXHAUSTED">مستهلك بالكامل</option>
        </select></div>
      {!shown.length ? <p className={styles.empty}>لا توجد دفاتر مطابقة.</p> : <div className={styles.booklets}>{shown.map(b => <div key={b.id} className={styles.booklet}>
        <div><strong dir="ltr">{b.serial}</strong><span>{statusLabels[b.status]}</span></div>
        <div><b>{b.status === "IN_STOCK" ? "22 كوبون غير مفعّل" : `${b.remainingCoupons} / 22`}</b><small>{b.status === "IN_STOCK" ? "بلا عميل" : "الرصيد الفعلي بالدفتر"}</small></div>
        <div>{b.customerId ? <Link href={`/admin/customers/${encodeURIComponent(b.customerId)}`}>عرض ملف العميل</Link> : <span>جاهز للبيع</span>}<small>{when(b.activatedAt ?? b.createdAt)}</small></div>
      </div>)}</div>}
      {data?.hasMore && <button className={styles.loadMore} type="button" disabled={moreLoading || busy} onClick={() => void loadMore()}>{moreLoading ? "جاري التحميل..." : "تحميل دفاتر أخرى"}</button>}
    </section>
    <section className={styles.panel}><h2><AlfanarIcon name="coins" /> سجل تحصيل أثمان الدفاتر</h2>
      {!data?.sales.length ? <p className={styles.empty}>لا توجد مبيعات دفاتر مسجلة.</p> : <div className={styles.booklets}>{data.sales.map(sale => <div key={sale.orderId} className={styles.booklet}>
        <div><strong>{sale.channel === "STORE" ? `بيع محل — دفتر ${sale.serial ?? ""}` : `طلب #${sale.orderId.split("-")[1] ?? sale.orderId}`}</strong><span>{when(sale.createdAt)}</span>{sale.channel === "STORE" && <small>الفترة المالية: {sale.financialDate} — {sale.financialPeriod === "MORNING" ? "صباحي" : "مسائي"}</small>}</div>
        <div><b>{amount(sale.priceFils)}</b><small>{sale.paymentMethod === "CLICK" ? "كليك" : "كاش"} — {sale.employeeName}</small></div>
        <Link href={`/admin/customers/${encodeURIComponent(sale.customerId)}`}>ملف العميل</Link>
      </div>)}</div>}
    </section>

    <section className={styles.panel}><h2>أرقام الدفاتر الحالية</h2><button type="button" disabled={busy} onClick={()=>void previewSerials()}>معاينة تحويل الأرقام</button></section>
    <ActionModal open={conversion!==null} title="توحيد أرقام الدفاتر" description={conversion?.conflicts.length ? "توجد أرقام متكررة؛ التحويل متوقف لحين تصحيحها." : "سيتم تحويل "+(conversion?.changes.length??0)+" رقم."} busy={busy} confirmLabel={conversion?.conflicts.length ? "إغلاق المعاينة" : "اعتماد تحويل الأرقام"} onClose={()=>{if(!busy)setConversion(null);}} onConfirm={()=>{if(conversion?.conflicts.length)setConversion(null);else void convertSerials();}}>
      <div style={{maxHeight:"40vh",overflowY:"auto"}}>{conversion?.conflicts.map(c=><p key={c.serial}>تعارض الرقم {c.serial}: {c.existing.join("، ")}</p>)}{conversion?.changes.map(c=><p key={c.id} dir="ltr">{c.before} → {c.after}</p>)}</div>
    </ActionModal>
    <ActionModal
      open={confirmDialog !== null}
      title={confirmDialog?.kind === "PRICE" ? "اعتماد سعر الدفتر" : "اعتماد الدفتر للعميل"}
      description={!confirmDialog ? "" : confirmDialog.kind === "PRICE"
        ? `السعر الجديد لدفتر الـ22 كوبون: ${amount(confirmDialog.priceFils)}.\nيسري السعر على المبيعات اللاحقة فقط.`
        : `الدفتر: ${confirmDialog.serial}\nالعميل: ${confirmDialog.customerName} — الطلب #${confirmDialog.orderNumber}.\nسيتم خصم ${Math.min(22,confirmDialog.pendingCoupons)} كوبون من الدفتر.${confirmDialog.pendingCoupons>22 ? ` المتبقي على العميل: ${confirmDialog.pendingCoupons-22} كوبون.` : ""}`}
      tone={confirmDialog?.kind === "APPROVE" ? "warning" : "info"}
      confirmLabel={confirmDialog?.kind === "PRICE" ? "حفظ السعر المعتمد" : "تأكيد اعتماد الدفتر"}
      busy={busy}
      onClose={() => { if (!busy) setConfirmDialog(null); }}
      onConfirm={() => void commitConfirmation()}
    />
  </main>;
}
