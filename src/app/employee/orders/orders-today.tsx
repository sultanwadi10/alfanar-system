"use client";
import { userMessage } from "@/lib/client/user-message";
import { useOperationChanges } from "@/lib/client/operation-changes";

import { BottleReturnFields, PreviousBottleReturnFields, bottleReturnsComplete, type BottleRequirement } from "@/components/store/bottle-return-fields";
import { CustomerContactActions } from "@/components/store/customer-contact-actions";
import type { BottleReturn } from "@/types/inventory";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./orders-today.module.css";
import ActionModal from "@/components/ui/action-modal";

type OrderStatus = "NEW" | "READY" | "DELIVERED" | "CANCELLED";
type PaymentMethod = "CASH" | "CLICK" | "COUPON";

type TodayOrder = {
  returnRequirements?: Array<{ itemId: string; label: string; quantity: number }>;
  bottleReturns?: BottleReturn[];
  previousBottleReturns?: Array<BottleReturn & { label: string }>;
  id: string;
  number: string;
  source?: "ADMIN" | "EMPLOYEE";
  status: OrderStatus;
  customer: { name: string; phone: string; address: string };
  notes: string;
  items: Array<{
    name: string;
    quantity: number;
    bottleOrigin: "JORDANIAN" | "SAUDI" | null;
    unitPriceFils: number;
    lineTotalFils: number;
  }>;
  itemCount: number;
  totalFils: number;
  paymentMethod: PaymentMethod;
  paymentState: string;
  pendingCouponQuantity: number;
  collectedFils: number;
  bookletRequestStatus: string | null;
  createdAt: string;
  readyAt: string | null;
  deliveredAt: string | null;
};

type ViewFilter = "ALL" | OrderStatus;

const labels: Record<OrderStatus, string> = {
  NEW: "جديد",
  READY: "جاهز للتوصيل",
  DELIVERED: "تم التسليم",
  CANCELLED: "ملغي",
};

const payments: Record<PaymentMethod, string> = {
  CASH: "كاش",
  CLICK: "كليك",
  COUPON: "كوبونات",
};

function formatMoney(fils: number) {
  return `${(fils / 1000).toFixed(3)} د.أ`;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Amman", hour: "numeric", minute: "2-digit",
  }).format(new Date(value));
}

function apiError(data: unknown) {
  if (data && typeof data === "object" && "error" in data) {
    const error = data.error;
    if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
      return error.message;
    }
  }
  return "تعذر إتمام العملية.";
}

export default function OrdersToday() {
  const router = useRouter();
  const [bottleReturns, setBottleReturns] = useState<BottleReturn[]>([]);
  const [previousBottleReturns, setPreviousBottleReturns] = useState<BottleReturn[]>([]);
  const [previousDebts, setPreviousDebts] = useState<{ orderId: string; rows: BottleRequirement[]; loading: boolean; error: string } | null>(null);
  const debtRequest = useRef(0);
  const [orders, setOrders] = useState<TodayOrder[]>([]);
  const [bookletPriceFils, setBookletPriceFils] = useState<number | null>(null);
  const [, setDay] = useState("");
  const [limitReached, setLimitReached] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ViewFilter>("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionDialog, setActionDialog] = useState<{
    orderId: string;
    kind: "STATUS" | "BOOKLET";
    action?: "READY" | "DELIVERED" | "CANCELLED";
  } | null>(null);
  const [paymentChoice,setPaymentChoice]=useState<"PAID"|"DUE"|null>(null);
  const [bookletPayment, setBookletPayment] = useState<"CASH" | "CLICK" | null>(null);

  const loadOrders = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    else setRefreshing(true);
    try {
      const response = await fetch("/api/operator/delivery-orders", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || data.success !== true) throw new Error(apiError(data));
      const nextOrders = (data.data?.orders ?? []) as TodayOrder[];
      setOrders(nextOrders);
      setBookletPriceFils(typeof data.data?.bookletPriceFils === "number" ? data.data.bookletPriceFils : null);
      setDay(data.data.day ?? "");
      setLimitReached(data.data.limitReached === true);
      setError("");
      setSelectedId((previous) => previous && nextOrders.some((order) => order.id === previous) ? previous : null);
    } catch (cause) {
      setError(userMessage(cause instanceof Error ? cause.message : "تعذر تحميل طلبات اليوم."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // Schedule the initial request outside the effect's synchronous phase.
    // This avoids triggering synchronous React state updates in the effect.
    const initialTimer = window.setTimeout(() => {
      void loadOrders();
    }, 0);

    return () => window.clearTimeout(initialTimer);
  }, [loadOrders]);
  useOperationChanges(["orders", "catalog"], () => { void loadOrders(true); }, !busyId && !actionDialog);

  const counts = useMemo(() => ({
    NEW: orders.filter((order) => order.status === "NEW").length,
    READY: orders.filter((order) => order.status === "READY").length,
    DELIVERED: orders.filter((order) => order.status === "DELIVERED").length,
    CANCELLED: orders.filter((order) => order.status === "CANCELLED").length,
  }), [orders]);

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("ar");
    return orders.filter((order) => {
      if (filter !== "ALL" && order.status !== filter) return false;
      if (!q) return true;
      return [order.number, order.customer.name, order.customer.phone, order.customer.address]
        .some((value) => value.toLocaleLowerCase("ar").includes(q));
    });
  }, [orders, query, filter]);

  const selectedOrder = orders.find((order) => order.id === selectedId) ?? null;

  async function loadPreviousDebts(orderId: string) {
    const token = ++debtRequest.current;
    setPreviousBottleReturns([]);
    setPreviousDebts({ orderId, rows: [], loading: true, error: "" });
    try {
      const response = await fetch(`/api/operator/delivery-orders/${encodeURIComponent(orderId)}/bottle-returns`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok || !result.success) throw Error(apiError(result));
      if (token === debtRequest.current) setPreviousDebts({ orderId, rows: result.data, loading: false, error: "" });
    } catch (cause) {
      if (token === debtRequest.current) setPreviousDebts({ orderId, rows: [], loading: false, error: cause instanceof Error ? cause.message : "تعذر تحميل العهدة السابقة." });
    }
  }
  function changeStatus(order: TodayOrder, action: "READY" | "DELIVERED" | "CANCELLED") {
    if (busyId) return;
    setError("");
    setPaymentChoice(null);
    setBottleReturns([]);
    setPreviousBottleReturns([]); setPreviousDebts(null); ++debtRequest.current;
    if (action === "DELIVERED" && (order.returnRequirements ?? []).length) void loadPreviousDebts(order.id);
    setActionDialog({ kind: "STATUS", action, orderId: order.id });
  }

  async function executeStatus(order: TodayOrder, action: "READY" | "DELIVERED" | "CANCELLED") {
    if (busyId) return;
    if(action === "DELIVERED" && order.paymentMethod !== "COUPON" && !paymentChoice) { setError(userMessage("اختر حالة التحصيل.")); return; }
    if (action === "DELIVERED" && (order.returnRequirements ?? []).some(r => !bottleReturns.some(v => v.itemId === r.itemId && Number.isInteger(v.quantity) && v.quantity >= 0 && v.quantity <= r.quantity))) { setError(userMessage("سجّل الفارغ المستلم لكل نوع أو أكّد استلام الكل.")); return; }
    if (action === "DELIVERED" && (previousDebts?.loading || previousBottleReturns.some(row => !Number.isSafeInteger(row.quantity) || row.quantity < 1 || row.quantity > (previousDebts?.rows.find(d => d.itemId === row.itemId)?.quantity ?? 0)))) { setError(userMessage("راجع عدد الفارغ السابق أو انتظر تحميل العهدة.")); return; }
    setBusyId(order.id);
    setError("");
    try {
      const response = await fetch(
        `/api/operator/delivery-orders/${encodeURIComponent(order.id)}/status`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ...(action === "DELIVERED" ? { bottleReturns, previousBottleReturns } : {}), paymentCollected: action === "DELIVERED" && order.paymentMethod !== "COUPON" && paymentChoice === "PAID", paymentDeferred: action === "DELIVERED" && order.paymentMethod !== "COUPON" && paymentChoice === "DUE" }),
        },
      );
      const data = await response.json();
      if (!response.ok || data.success !== true) throw new Error(apiError(data));
      setActionDialog(null);
      await loadOrders(true);
    } catch (cause) {
      setError(userMessage(cause instanceof Error ? cause.message : "تعذر تحديث الطلب."));
    } finally {
      setBusyId(null);
    }
  }

  function confirmBooklet(order: TodayOrder) {
    if (busyId || order.status !== "DELIVERED" || order.bookletRequestStatus !== "REQUESTED") return;
    if (bookletPriceFils === null) {
      setError(userMessage("سعر دفتر الكوبونات غير محدد. اطلب من الإدارة تحديد السعر أولًا."));
      return;
    }
    setBookletPayment(null);
    setError("");
    setActionDialog({ kind: "BOOKLET", orderId: order.id });
  }

  async function executeBooklet(order: TodayOrder, method: "CASH" | "CLICK") {
    if (busyId || bookletPriceFils === null) return;
    setBusyId(order.id);
    setError("");
    try {
      const response = await fetch(`/api/operator/delivery-orders/${encodeURIComponent(order.id)}/booklet-handover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentMethod: method, expectedPriceFils: bookletPriceFils, confirmed: true }),
      });
      const result = await response.json();
      if (!response.ok || result.success !== true) throw new Error(apiError(result));
      setActionDialog(null);
      setBookletPayment(null);
      await loadOrders(true);
    } catch (cause) {
      setError(userMessage(cause instanceof Error ? cause.message : "تعذّر تأكيد تسليم الدفتر."));
    } finally {
      setBusyId(null);
    }
  }

  const dialogOrder = orders.find((order) => order.id === actionDialog?.orderId) ?? null;
  const dialogAction = actionDialog?.action;
  const activePrevious = previousDebts?.orderId === dialogOrder?.id ? previousDebts : null;
  const currentComplete = bottleReturnsComplete(dialogOrder?.returnRequirements ?? [], bottleReturns);
  const previousValid = previousBottleReturns.every(row => Number.isSafeInteger(row.quantity) && row.quantity > 0 && row.quantity <= (activePrevious?.rows.find(d => d.itemId === row.itemId)?.quantity ?? 0));
  const dialogTitle = actionDialog?.kind === "BOOKLET"
    ? "تسليم دفتر الكوبونات وتحصيل ثمنه"
    : dialogAction === "READY" ? "تأكيد تجهيز الطلب"
    : dialogAction === "DELIVERED" ? "تأكيد تسليم الطلب"
    : "إلغاء طلب التوصيل";
  const dialogDescription = !dialogOrder ? ""
    : actionDialog?.kind === "BOOKLET"
      ? `العميل: ${dialogOrder.customer.name}\nثمن دفتر الـ22 كوبون: ${bookletPriceFils === null ? "غير محدد" : formatMoney(bookletPriceFils)}.\nتأكيد تسليم الدفتر وقبض ثمنه.`
      : dialogAction === "READY"
        ? `هل تم تجهيز الطلب #${dialogOrder.number} بالكامل؟`
        : dialogAction === "DELIVERED"
          ? dialogOrder.paymentMethod === "COUPON"
            ? `هل تم تسليم الطلب #${dialogOrder.number} فعليًا؟`
            : `هل استلم العميل الطلب #${dialogOrder.number} فعليًا؟`
          : `هل تريد إلغاء الطلب #${dialogOrder.number}؟`;

  return (
    <main className={styles.page} dir="rtl">
      <div className={styles.container}>
        <header className={styles.header}>
          <div>
            <span className={styles.eyebrow}>محطة الفنار / إدارة التوصيل</span>
            <h1>طلبات اليوم</h1>

          </div>
          <div className={styles.headerActions}>
            <button type="button" onClick={() => void loadOrders(true)} disabled={refreshing || loading}>
              {refreshing ? "جاري التحديث..." : "تحديث"}
            </button>
            <button type="button" onClick={() => router.push("/employee/orders/new")} className={styles.primary}>+ طلب توصيل</button>
            <button type="button" onClick={() => router.push("/employee")}>الرئيسية</button>
          </div>
        </header>

        <div className={styles.stats}>
          <div className={styles.stat}><span>جديد</span><strong>{counts.NEW}</strong></div>
          <div className={styles.stat}><span>جاهز</span><strong>{counts.READY}</strong></div>
          <div className={styles.stat}><span>تم التسليم</span><strong>{counts.DELIVERED}</strong></div>
          <div className={styles.stat}><span>إجمالي طلبات اليوم</span><strong>{orders.length}</strong></div>
        </div>

        {error && <div className={styles.error} role="alert">{error}</div>}
        {limitReached && <div className={styles.error}>وصل عدد الطلبات إلى حد العرض (500). راجع الإدارة للتأكد من اكتمال القائمة.</div>}
        <section className={styles.board}>
          <div className={styles.toolbar}>
            <input
              type="search" value={query} onChange={(event) => setQuery(event.target.value)}
              placeholder="ابحث برقم الطلب، الاسم، الهاتف، العنوان..."
              aria-label="بحث في طلبات اليوم"
            />
            <div className={styles.filters}>
              {(["ALL", "NEW", "READY", "DELIVERED", "CANCELLED"] as const).map((item) => (
                <button key={item} type="button" aria-pressed={filter === item}
                  className={filter === item ? styles.activeFilter : ""}
                  onClick={() => setFilter(item)}>
                  {item === "ALL" ? "الكل" : labels[item]}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className={styles.empty}>جاري تحميل طلبات التوصيل...</div>
          ) : filtered.length === 0 ? (
            <div className={styles.empty}>
              <strong>ما في طلبات مطابقة</strong>
              <p>لا توجد طلبات مطابقة.</p>
            </div>
          ) : (
            <div className={styles.cards}>
              {filtered.map((order) => (
                <article key={order.id} className={styles.card}>
                  <div className={styles.cardHead}>
                    <div><span className={styles.number}>#{order.number}</span><small>{formatTime(order.createdAt)}</small>{order.source === "ADMIN" && <small>من الإدارة</small>}</div>
                    <span className={`${styles.status} ${styles[order.status.toLowerCase()]}`}>{labels[order.status]}</span>
                  </div>
                  <h2>{order.customer.name}</h2>
                  <p className={styles.address}>⌖ {order.customer.address}</p>
                  <div className={styles.cardMeta}>
                    <span>{order.itemCount} قطعة</span>
                    <span>{payments[order.paymentMethod]}</span>
                    <strong>{formatMoney(order.totalFils)}</strong>
                  </div>
                  {order.status === "DELIVERED" && order.pendingCouponQuantity>0 && <p className={styles.bookletNote}>مستحق: {order.pendingCouponQuantity} كوبون</p>}
                  {order.status === "DELIVERED" && ["PAYMENT_DUE","PARTIALLY_COLLECTED"].includes(order.paymentState) && <p className={styles.bookletNote}>المتبقي: {formatMoney(order.totalFils-order.collectedFils)}</p>}
                  {order.bookletRequestStatus && order.bookletRequestStatus !== "CANCELLED" && (
                    <p className={styles.bookletNote}>دفتر جديد مطلوب — بانتظار التسليم والاعتماد.</p>
                  )}
                  <div className={styles.buttons}>
                    <button type="button" onClick={() => setSelectedId(order.id)}>التفاصيل</button>
                    {order.status === "NEW" && <button type="button" className={styles.readyButton} disabled={busyId !== null} onClick={() => void changeStatus(order, "READY")}>جاهز ✓</button>}
                    {order.status === "READY" && <button type="button" className={styles.deliverButton} disabled={busyId !== null} onClick={() => void changeStatus(order, "DELIVERED")}>تم التسليم ✓</button>}
                    {order.status === "DELIVERED" && order.bookletRequestStatus === "REQUESTED" && <button type="button" disabled={busyId !== null} onClick={() => void confirmBooklet(order)}>تسليم دفتر + تحصيل ثمنه</button>}
                    {order.status === "NEW" && <button type="button" className={styles.cancelButton} disabled={busyId !== null} onClick={() => void changeStatus(order, "CANCELLED")}>إلغاء</button>}
                  </div>
                </article>
              ))}
            </div>
          )}

        </section>
      </div>

      {selectedOrder && (
        <div className={styles.overlay} role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSelectedId(null);
        }}>
          <section className={styles.details} role="dialog" aria-modal="true" aria-label={`تفاصيل الطلب ${selectedOrder.number}`}>
            <div className={styles.detailsHeader}>
              <div><small>طلب توصيل</small><h2>#{selectedOrder.number}</h2></div>
              <button type="button" onClick={() => setSelectedId(null)}>إغلاق ×</button>
            </div>
            <span className={`${styles.status} ${styles[selectedOrder.status.toLowerCase()]}`}>
              {labels[selectedOrder.status]}
            </span>
            <div className={styles.detailSection}>
              <h3>الزبون والتوصيل</h3>
              <strong>{selectedOrder.customer.name}</strong>
              <p>{selectedOrder.customer.address}</p>
              <CustomerContactActions phone={selectedOrder.customer.phone} customerName={selectedOrder.customer.name}/>
            </div>
            <div className={styles.detailSection}>
              <h3>الأصناف المطلوبة</h3>
              {selectedOrder.items.map((item, index) => (
                <div key={`${index}-${item.name}`} className={styles.detailItem}>
                  <span>{item.name}{item.bottleOrigin ? ` — ${item.bottleOrigin === "JORDANIAN" ? "أردني" : "سعودي"}` : ""} × {item.quantity}</span>
                  <strong>{formatMoney(item.lineTotalFils)}</strong>
                </div>
              ))}
              <div className={styles.detailTotal}><span>المجموع قبل التسويات</span><strong>{formatMoney(selectedOrder.totalFils)}</strong></div>
            </div>
            <div className={styles.detailSection}>
              <h3>الدفع والملاحظات</h3>
              <p>طريقة الدفع: <strong>{payments[selectedOrder.paymentMethod]}</strong></p>
              <p>{selectedOrder.notes || "لا توجد ملاحظات."}</p>
              {selectedOrder.bookletRequestStatus && <p className={styles.bookletNote}>حالة الدفتر: {selectedOrder.bookletRequestStatus === "HANDED_OVER" ? "تم البيع والتسليم وبانتظار اعتماد الإدارة" : selectedOrder.bookletRequestStatus === "APPROVED" ? "تم اعتماد الدفتر من الإدارة" : "دفتر جديد مطلوب — بانتظار التسليم"}. {selectedOrder.bookletRequestStatus === "REQUESTED" && bookletPriceFils !== null ? `سعر الدفتر ${formatMoney(bookletPriceFils)}.` : ""}</p>}
            </div>
            {selectedOrder.status === "DELIVERED" && (selectedOrder.returnRequirements ?? []).length > 0 && <div className={styles.detailSection}><h3>الفارغ المسجل عند التسليم</h3>{selectedOrder.returnRequirements!.map(row => <p key={row.itemId}>{row.label}: استلمنا {selectedOrder.bottleReturns?.find(v => v.itemId === row.itemId)?.quantity ?? 0} من {row.quantity}</p>)}</div>}
            {!!selectedOrder.previousBottleReturns?.length && <div className={styles.detailSection}><h3>فوارغ سابقة استُلمت مع الطلب</h3>{selectedOrder.previousBottleReturns.map(r => <p key={r.itemId}>{r.label}: {r.quantity}</p>)}</div>}
            <div className={styles.detailActions}>
              {selectedOrder.status === "DELIVERED" && selectedOrder.pendingCouponQuantity>0 && <p role="status">مستحق: {selectedOrder.pendingCouponQuantity} كوبون</p>}
              {selectedOrder.status === "DELIVERED" && ["PAYMENT_DUE","PARTIALLY_COLLECTED"].includes(selectedOrder.paymentState) && <p role="status">المتبقي: {formatMoney(selectedOrder.totalFils-selectedOrder.collectedFils)}</p>}
              {selectedOrder.status === "NEW" && <button type="button" disabled={busyId !== null} onClick={() => void changeStatus(selectedOrder, "READY")}>تأكيد تجهيز الطلب</button>}
              {selectedOrder.status === "READY" && <button type="button" disabled={busyId !== null} onClick={() => void changeStatus(selectedOrder, "DELIVERED")}>تأكيد التسليم</button>}
              {selectedOrder.status === "DELIVERED" && selectedOrder.bookletRequestStatus === "REQUESTED" && <button type="button" disabled={busyId !== null} onClick={() => void confirmBooklet(selectedOrder)}>تأكيد تسليم الدفتر وقبض ثمنه</button>}
              {selectedOrder.status === "NEW" && <button type="button" className={styles.cancelButton} disabled={busyId !== null} onClick={() => void changeStatus(selectedOrder, "CANCELLED")}>إلغاء الطلب</button>}
            </div>
          </section>
        </div>
      )}
      <ActionModal
        open={actionDialog !== null && dialogOrder !== null}
        title={dialogTitle}
        description={dialogDescription}
        tone={actionDialog?.kind === "BOOKLET" ? "warning" : dialogAction === "CANCELLED" ? "danger" : dialogAction === "DELIVERED" ? "success" : "info"}
        busy={busyId !== null}
        confirmLabel={actionDialog?.kind === "BOOKLET" ? "تأكيد التسليم والتحصيل" : dialogAction === "READY" ? "اعتماد التجهيز" : dialogAction === "DELIVERED" ? "تأكيد التسليم" : "تأكيد الإلغاء"}
        confirmDisabled={actionDialog?.kind === "BOOKLET" ? !bookletPayment : dialogAction === "DELIVERED" && ((dialogOrder?.paymentMethod !== "COUPON" && !paymentChoice) || !currentComplete || !previousValid || activePrevious?.loading === true)}
        choices={actionDialog?.kind === "BOOKLET" ? [
          { value: "CASH", label: "كاش", description: "تحصيل نقدي" },
          { value: "CLICK", label: "كليك", description: "تحصيل إلكتروني" },
        ] : undefined}
        selectedChoice={bookletPayment}
        onChoiceChange={(value) => setBookletPayment(value === "CASH" ? "CASH" : "CLICK")}
        onClose={() => { if (busyId === null) { ++debtRequest.current; setActionDialog(null); setError(""); } }}
        onConfirm={() => {
          if (!dialogOrder || !actionDialog) return;
          if (actionDialog.kind === "BOOKLET") {
            if (bookletPayment) void executeBooklet(dialogOrder, bookletPayment);
          } else if (actionDialog.action) {
            void executeStatus(dialogOrder, actionDialog.action);
          }
        }}
      >
        {dialogAction === "DELIVERED" && dialogOrder && <fieldset disabled={busyId!==null} style={{display:"grid",gap:14,padding:16,border:"1px solid var(--color-border)",borderRadius:14}}><legend>التحصيل عند التسليم</legend>{dialogOrder.paymentMethod === "COUPON" ? <p>{dialogOrder.pendingCouponQuantity>0 ? "المتبقي على العميل: "+dialogOrder.pendingCouponQuantity+" كوبون" : "الكوبونات متوفرة للطلب"}</p> : <><label><input type="radio" name="collection" checked={paymentChoice==="PAID"} onChange={()=>setPaymentChoice("PAID")}/> تم استلام {formatMoney(dialogOrder.totalFils)} — {payments[dialogOrder.paymentMethod]}</label><label><input type="radio" name="collection" checked={paymentChoice==="DUE"} onChange={()=>setPaymentChoice("DUE")}/> تم تسليم الطلب والمبلغ باقي على العميل</label></>}</fieldset>}
        {dialogAction === "DELIVERED" && dialogOrder && (dialogOrder.returnRequirements ?? []).length > 0 && <>
          <BottleReturnFields key={dialogOrder.id} requirements={dialogOrder.returnRequirements ?? []} value={bottleReturns} onChange={setBottleReturns} disabled={busyId !== null}/>
          {activePrevious?.loading && <p role="status">جارٍ تحميل العهدة السابقة…</p>}
          {activePrevious?.error && <div role="status"><p>{activePrevious.error} تسوية العهدة السابقة غير متاحة حاليًا.</p><button type="button" disabled={busyId !== null} onClick={() => void loadPreviousDebts(dialogOrder.id)}>إعادة تحميل العهدة</button></div>}
          {activePrevious && !activePrevious.loading && !activePrevious.error && <PreviousBottleReturnFields key={dialogOrder.id+"previous"} debts={activePrevious.rows} value={previousBottleReturns} onChange={setPreviousBottleReturns} disabled={busyId !== null}/>}
          {!previousValid && <p role="alert">عدد الفارغ السابق يجب أن يكون ضمن العهدة المسجلة.</p>}
          {currentComplete && previousValid && activePrevious && !activePrevious.loading && !activePrevious.error && activePrevious.rows.length > 0 && <p role="status" style={{ fontWeight: 800, lineHeight: 1.8 }}>إجمالي الفارغ المستلم: {bottleReturns.reduce((sum, r) => sum + r.quantity, 0) + previousBottleReturns.reduce((sum, r) => sum + r.quantity, 0)}. العهدة المتبقية بعد التسليم: {activePrevious.rows.reduce((sum, r) => sum + r.quantity, 0) - previousBottleReturns.reduce((sum, r) => sum + r.quantity, 0) + (dialogOrder.returnRequirements ?? []).reduce((sum, r) => sum + r.quantity, 0) - bottleReturns.reduce((sum, r) => sum + r.quantity, 0)} قارورة.</p>}
        </>}
        {error && <p role="alert" style={{ color: "#e15b61", fontWeight: 800 }}>{error}</p>}
      </ActionModal>
    </main>
  );
}
