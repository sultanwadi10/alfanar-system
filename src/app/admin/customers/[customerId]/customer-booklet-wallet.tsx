"use client";
import { userMessage } from "@/lib/client/user-message";
import { useTransientMessage } from "@/lib/client/use-transient-message";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlfanarIcon } from "@/components/admin/alfanar-icon";
import styles from "./customer-booklet-wallet.module.css";
import { newRequestId } from "@/lib/client/request-id";
import ActionModal from "@/components/ui/action-modal";

export type CustomerWalletData = {
  totalOrderCount: number;
  truncated: boolean;
  orders: Array<{ id: string; number: string; status: string; createdAt: string | null; bookletRequestStatus?: string | null }>;
  booklets: Array<{
    id: string; serial: string; status: string; issuedCoupons: number;
    remainingCoupons: number; reservedCoupons: number;
    activatedAt: string | null; createdAt: string | null; orderId: string | null;
  }>;
  events: Array<{
    id: string; bookletId: string; type: string; quantity: number;
    orderId?: string; createdAt: string | null;
  }>;
};

type StockItem = { id: string; serial: string; status: string };
const stamp = (value: string | null) => value ? new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Amman", dateStyle: "medium", timeStyle: "short",
}).format(new Date(value)) : "—";
const label = (status: string) => status === "ACTIVE" ? "نشط" : status === "EXHAUSTED" ? "مستهلك" : status === "IN_STOCK" ? "في المخزون" : status;

export function CustomerBookletWallet({ customerId, customerName, isArchived, data }: {
  customerId: string; customerName: string; isArchived: boolean; data: CustomerWalletData;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [confirmAssign, setConfirmAssign] = useState(false);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [stockLoading, setStockLoading] = useState(false);
  const [bookletId, setBookletId] = useState("");
  const [mode,setMode]=useState<"SALE"|"PREVIOUS">("SALE");
  const [paymentMethod,setPaymentMethod]=useState<"CASH"|"CLICK">("CASH");
  const [priceFils,setPriceFils]=useState<number|null>(null);
  const [financialDate,setFinancialDate]=useState("");
  const [period,setPeriod]=useState("");
  const [confirmed,setConfirmed]=useState(false);
  const [requestKey,setRequestKey]=useState({fingerprint:"",id:""});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useTransientMessage(notice, setNotice);
  const active = data.booklets.filter(b => b.status === "ACTIVE" && b.remainingCoupons > 0);
  const remaining = active.reduce((sum, booklet) => sum + booklet.remainingCoupons, 0);
  const waiting = data.orders.filter(o => o.bookletRequestStatus === "REQUESTED" || o.bookletRequestStatus === "HANDED_OVER").length;
  const byId = useMemo(() => new Map(data.booklets.map(b => [b.id, b.serial])), [data.booklets]);

  async function startAssignment() {
    if (isArchived) return;
    setAssignOpen(true); setStockLoading(true); setStock([]);setPriceFils(null);setError(""); setBookletId("");setConfirmed(false);setMode("SALE");setRequestKey({fingerprint:"",id:""});
    try {
      const response = await fetch(`/api/admin/customers/${encodeURIComponent(customerId)}/booklets`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok || result.success !== true) throw new Error(result?.error?.message ?? "تعذّر تحميل المخزون.");
      setStock(result.data.booklets);setPriceFils(result.data.priceFils);setFinancialDate(result.data.suggestion.workDay);setPeriod(result.data.suggestion.shiftType === "OTHER" ? "" : result.data.suggestion.shiftType);
    } catch (cause) {
      setError(userMessage(cause instanceof Error ? cause.message : "تعذّر تحميل المخزون."));
    } finally { setStockLoading(false); }
  }

  function beginAssign() {
    if (busy || !bookletId || !confirmed || (mode === "SALE" && (!priceFils || !financialDate || !period))) {setError(userMessage("اختر الدفتر وأكمل بيانات البيع وتأكيد التسليم والتحصيل."));return;}
    if (!stock.some(b => b.id === bookletId)) { setError(userMessage("الدفتر المختار لم يعد موجودًا في القائمة. حدّث المخزون.")); return; }
    setError("");
    setConfirmAssign(true);
  }

  async function assign() {
    if (busy || !confirmAssign || !bookletId || !confirmed) return;
    const selected = stock.find(b => b.id === bookletId);
    if (!selected) return;
    setBusy(true); setError("");
    const fingerprint=JSON.stringify([bookletId,mode,paymentMethod,priceFils,financialDate,period]);
    const requestId=requestKey.fingerprint===fingerprint?requestKey.id:newRequestId();setRequestKey({fingerprint,id:requestId});
    try {
      const response = await fetch(`/api/admin/customers/${encodeURIComponent(customerId)}/booklets`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "SALE" ? {action:mode, bookletId,requestId,paymentMethod,expectedPriceFils:priceFils,financialDate,period,confirmed:true} : {action:mode,bookletId,confirmed:true}),
      });
      const result = await response.json();
      if (!response.ok || result.success !== true) throw new Error(result?.error?.message ?? "تعذّر إصدار الدفتر.");
      setNotice(`تم ربط الدفتر ${selected.serial} بالعميل بنجاح.`);
      setConfirmAssign(false); setAssignOpen(false); setBookletId(""); setConfirmed(false);
      router.refresh();
    } catch (cause) { setError(userMessage(cause instanceof Error ? cause.message : "تعذّر إصدار الدفتر.")); }
    finally { setBusy(false); }
  }

  return <div className={styles.wrap} dir="rtl">
    <section className={styles.metrics} aria-label="ملخص محفظة العميل">
      <article className={`${styles.metric} ${styles.blue}`}><span><AlfanarIcon name="book" /> الدفاتر النشطة</span><strong>{active.length}</strong></article>
      <article className={`${styles.metric} ${styles.green}`}><span><AlfanarIcon name="ticket" /> الكوبونات المتبقية</span><strong>{remaining}</strong></article>
      <article className={`${styles.metric} ${styles.blue}`}><span><AlfanarIcon name="truck" /> طلبات التوصيل</span><strong>{data.totalOrderCount}</strong></article>
      <article className={`${styles.metric} ${styles.amber}`}><span><AlfanarIcon name="clock" /> دفاتر بانتظار الاعتماد</span><strong>{waiting}</strong></article>
    </section>

    {notice && <p role="status" className={styles.success}>{notice}</p>}
    {error && !assignOpen && <p role="alert" className={styles.error}>{error}</p>}
    {data.truncated && <p className={styles.note}>النتائج المعروضة جزئية.</p>}

    <section className={styles.panel}>
      <header className={styles.panelHeader}>
        <div><p className={styles.eyebrow}>المحفظة الفعلية</p><h2><AlfanarIcon name="book" /> محفظة الدفاتر</h2></div>
        <button className={styles.primary} onClick={() => void startAssignment()} disabled={isArchived}><AlfanarIcon name="plus" /> إضافة دفتر للعميل</button>
      </header>

      {!data.booklets.length ? <div className={styles.empty}><AlfanarIcon name="book" /><strong>لا توجد دفاتر مرتبطة بهذا العميل</strong><span>يمكن إصدار دفتر موجود بالمخزون من الإدارة، أو اعتماده بعد توصيله.</span></div>
        : <div className={styles.booklets}>{data.booklets.map(b => {
          const percentage = Math.max(0, Math.min(100, (b.remainingCoupons / (b.issuedCoupons || 22)) * 100));
          return <article className={styles.booklet} key={b.id}>
            <button type="button" className={styles.bookletTop} onClick={() => setExpanded(previous => previous === b.id ? null : b.id)} aria-expanded={expanded === b.id}>
              <span className={styles.serial}><AlfanarIcon name="book" /> <b dir="ltr">{b.serial}</b></span>
              <span className={`${styles.status} ${b.status === "ACTIVE" ? styles.active : styles.exhausted}`}>{label(b.status)}</span>
              <span className={styles.bookletAmount}><b>{b.remainingCoupons} / {b.issuedCoupons || 22}</b><small>كوبون متبقٍ</small></span>
              <AlfanarIcon name={expanded === b.id ? "chevron-up" : "chevron-down"} />
            </button>
            <div className={styles.progress}><span style={{ width: `${percentage}%` }} /></div>
            <div className={styles.bookletMeta}><span><AlfanarIcon name="calendar" /> {stamp(b.activatedAt ?? b.createdAt)}</span><span><AlfanarIcon name="ticket" /> {b.issuedCoupons || 22} كوبونًا أصلًا</span><span><AlfanarIcon name="shield" /> رصيد موثّق</span></div>
            {expanded === b.id && <div className={styles.bookletDetails}>
              <span>معرّف الدفتر الداخلي: <code dir="ltr">{b.id.slice(0, 12)}…</code></span>
              <span>التسجيل: {b.orderId ? "تم الاعتماد من طلب توصيل" : "إصدار مباشر من الإدارة"}</span>
              {b.orderId && <Link href="/admin/orders">عرض الطلبات للتدقيق</Link>}
            </div>}
          </article>;
        })}</div>}
    </section>

    <section className={styles.panel}>
      <header className={styles.panelHeader}><div><p className={styles.eyebrow}>سجل تدقيقي</p><h2><AlfanarIcon name="activity" /> سجل حركة الكوبونات</h2></div></header>
      {!data.events.length ? <div className={styles.empty}><AlfanarIcon name="activity" /><strong>لا توجد حركات مسجلة بعد</strong></div> :
        <div className={styles.tableScroller}><table className={styles.ledger}><thead><tr><th>التاريخ والوقت</th><th>نوع الحركة</th><th>الكمية</th><th>الدفتر</th><th>رقم الطلب (للتدقيق)</th></tr></thead><tbody>{data.events.map(event => <tr key={event.id}>
          <td>{stamp(event.createdAt)}</td>
          <td><span className={event.type === "ORDER_DEBIT" ? styles.debit : styles.credit}>{event.type === "ORDER_DEBIT" ? "استهلاك كوبونات" : "إصدار دفتر"}</span></td>
          <td className={event.type === "ORDER_DEBIT" ? styles.minus : styles.plus}>{event.type === "ORDER_DEBIT" ? "−" : "+"}{event.quantity}</td>
          <td dir="ltr">{byId.get(event.bookletId) ?? "—"}</td>
          <td dir="ltr">{event.orderId ?? "—"}</td>
        </tr>)}</tbody></table></div>}
    </section>

    {assignOpen && <div className={styles.backdrop} role="presentation" onMouseDown={event => { if (event.currentTarget === event.target && !busy) setAssignOpen(false); }}><section role="dialog" aria-modal="true" aria-label="إضافة دفتر مرقّم للعميل" className={styles.modal}>
      <header><h2><AlfanarIcon name="plus" /> إصدار دفتر للعميل</h2><button className={styles.close} type="button" onClick={() => setAssignOpen(false)} disabled={busy} aria-label="إغلاق"><AlfanarIcon name="x" /></button></header>
      <label>نوع العملية<select value={mode} disabled={busy} onChange={e=>{setMode(e.target.value as "SALE"|"PREVIOUS");setConfirmed(false);}}><option value="SALE">بيع دفتر في المحل</option><option value="PREVIOUS">ربط دفتر مدفوع سابقًا — دون تحصيل جديد</option></select></label>

      {mode === "SALE" && <><p>سعر الدفتر: <strong>{priceFils ? (priceFils/1000).toFixed(3)+" د.أ" : "حدّد السعر في إدارة الدفاتر أولًا"}</strong></p><label>طريقة الدفع<select value={paymentMethod} disabled={busy} onChange={e=>setPaymentMethod(e.target.value as "CASH"|"CLICK")}><option value="CASH">كاش</option><option value="CLICK">كليك / تحويل</option></select></label><label>تاريخ البيع<input type="date" value={financialDate} disabled={busy} onChange={e=>setFinancialDate(e.target.value)} lang="en-GB"/></label><label>الفترة المالية<select value={period} disabled={busy} onChange={e=>setPeriod(e.target.value)}><option value="">اختر الفترة</option><option value="MORNING">صباحي</option><option value="EVENING">مسائي</option></select></label></>}
      <label>الدفتر الموجود بالمخزون<select value={bookletId} onChange={event => setBookletId(event.target.value)} disabled={busy || stockLoading}><option value="">{stockLoading ? "جاري التحميل..." : "اختر رقم الدفتر الفعلي"}</option>{stock.map(item => <option key={item.id} value={item.id}>{item.serial}</option>)}</select></label>
      {!stockLoading && stock.length === 0 && <small>لا توجد دفاتر متاحة. <Link href="/admin/coupons">إدارة المخزون</Link></small>}
      <label className={styles.confirmation}><input type="checkbox" checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)}/> أؤكد تسليم الدفتر الفعلي واستلام ثمنه{mode === "PREVIOUS" ? " وتسجيل تحصيله سابقًا" : ""}</label>
      <div className={styles.modalActions}><button className={styles.primary} type="button" onClick={beginAssign} disabled={busy || !bookletId || !confirmed || (mode === "SALE" && (!priceFils || !period || !financialDate))}>{busy ? "جاري الاعتماد..." : "تأكيد إصدار 22 كوبونًا"}</button><button className={styles.secondary} type="button" disabled={busy} onClick={() => setAssignOpen(false)}>إلغاء</button></div>
      {error && <p className={styles.error} role="alert">{error}</p>}
    </section></div>}
    <ActionModal
      open={confirmAssign}
      title={mode === "SALE" ? "تأكيد بيع دفتر في المحل" : "ربط دفتر مدفوع سابقًا"}
      description={`العميل: ${customerName}\nرقم الدفتر: ${stock.find(item => item.id === bookletId)?.serial ?? "—"}\n${mode === "SALE" ? `التحصيل: ${((priceFils??0)/1000).toFixed(3)} د.أ — ${paymentMethod === "CASH" ? "كاش" : "كليك"}\n${financialDate} — ${period === "MORNING" ? "صباحي" : "مسائي"}` : "لا يسجل تحصيلًا جديدًا."}\nيضيف 22 كوبونًا.`}
      tone="warning"
      busy={busy}
      confirmLabel={mode === "SALE" ? "تأكيد البيع والتحصيل" : "اعتماد الربط السابق"}
      onClose={() => { if (!busy) setConfirmAssign(false); }}
      onConfirm={() => void assign()}
    >

      {error && <p role="alert" style={{ color: "#e15b61", fontWeight: 800 }}>{error}</p>}
    </ActionModal>
  </div>;
}
