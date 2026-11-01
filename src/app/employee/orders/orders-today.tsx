"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./orders-today.module.css";
import ActionModal from "@/components/ui/action-modal";

type OrderStatus = "NEW" | "READY" | "DELIVERED" | "CANCELLED";
type PaymentMethod = "CASH" | "CLICK" | "COUPON";

type TodayOrder = {
  id: string;
  number: string;
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
  return new Intl.DateTimeFormat("ar-JO", {
    timeZone: "Asia/Amman", hour: "numeric", minute: "2-digit",
  }).format(new Date(value));
}

function readablePhone(phone: string) {
  if (phone.startsWith("+9627") && phone.length === 13) {
    return `0${phone.slice(4)}`;
  }
  return phone;
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
  const [orders, setOrders] = useState<TodayOrder[]>([]);
  const [bookletPriceFils, setBookletPriceFils] = useState<number | null>(null);
  const [day, setDay] = useState("");
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
      setError(cause instanceof Error ? cause.message : "تعذر تحميل طلبات اليوم.");
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

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadOrders(true);
      }
    }, 20000);

    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
    };
  }, [loadOrders]);

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

  function changeStatus(order: TodayOrder, action: "READY" | "DELIVERED" | "CANCELLED") {
    if (busyId) return;
    setError("");
    setActionDialog({ kind: "STATUS", action, orderId: order.id });
  }

  async function executeStatus(order: TodayOrder, action: "READY" | "DELIVERED" | "CANCELLED") {
    if (busyId) return;
    setBusyId(order.id);
    setError("");
    try {
      const response = await fetch(
        `/api/operator/delivery-orders/${encodeURIComponent(order.id)}/status`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, paymentCollected: action === "DELIVERED" && order.paymentMethod !== "COUPON" }),
        },
      );
      const data = await response.json();
      if (!response.ok || data.success !== true) throw new Error(apiError(data));
      setActionDialog(null);
      await loadOrders(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحديث الطلب.");
    } finally {
      setBusyId(null);
    }
  }

  function confirmBooklet(order: TodayOrder) {
    if (busyId || order.status !== "DELIVERED" || order.bookletRequestStatus !== "REQUESTED") return;
    if (bookletPriceFils === null) {
      setError("سعر دفتر الكوبونات غير محدد. اطلب من الإدارة تحديد السعر أولًا.");
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
      setError(cause instanceof Error ? cause.message : "تعذّر تأكيد تسليم الدفتر.");
    } finally {
      setBusyId(null);
    }
  }

  const dialogOrder = orders.find((order) => order.id === actionDialog?.orderId) ?? null;
  const dialogAction = actionDialog?.action;
  const dialogTitle = actionDialog?.kind === "BOOKLET"
    ? "تسليم دفتر الكوبونات وتحصيل ثمنه"
    : dialogAction === "READY" ? "تأكيد تجهيز الطلب"
    : dialogAction === "DELIVERED" ? "تأكيد تسليم الطلب والتحصيل"
    : "إلغاء طلب التوصيل";
  const dialogDescription = !dialogOrder ? ""
    : actionDialog?.kind === "BOOKLET"
      ? `العميل: ${dialogOrder.customer.name}\nثمن دفتر الـ22 كوبون: ${bookletPriceFils === null ? "غير محدد" : formatMoney(bookletPriceFils)}.\nاختر طريقة التحصيل، ثم أكد أنك سلّمت الدفتر فعليًا وقبضت الثمن. رقم الدفتر سيُعتمد لاحقًا من الإدارة.`
      : dialogAction === "READY"
        ? `هل تم تجهيز الطلب #${dialogOrder.number} بالكامل؟\nسينتقل الطلب إلى حالة «جاهز للتوصيل».`
        : dialogAction === "DELIVERED"
          ? dialogOrder.paymentMethod === "COUPON"
            ? `هل تم تسليم الطلب #${dialogOrder.number} فعليًا؟\nسيُعتمد استهلاك الكوبونات المحجوزة فقط، وتبقى أي كوبونات مؤجّلة بانتظار اعتماد الإدارة.`
            : `هل تم تسليم الطلب #${dialogOrder.number} وقبض ${formatMoney(dialogOrder.totalFils)} بطريقة «${payments[dialogOrder.paymentMethod]}» فعليًا؟\nسيُسجّل التحصيل بالشفت مرة واحدة بعد تأكيدك.`
          : `هل تريد إلغاء الطلب #${dialogOrder.number}؟\nسيتم تحرير أي كوبونات محجوزة، ولن يمكن إرجاع الحالة تلقائيًا.`;

  return (
    <main className={styles.page} dir="rtl">
      <div className={styles.container}>
        <header className={styles.header}>
          <div>
            <span className={styles.eyebrow}>محطة الفنار / إدارة التوصيل</span>
            <h1>طلبات اليوم</h1>
            <p>من تجهيز الطلبات إلى تسليمها. التحديث تلقائي كل 20 ثانية أثناء فتح الصفحة.</p>
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
              <p>جرّب تغيير الفلتر أو تسجيل أول طلب توصيل.</p>
            </div>
          ) : (
            <div className={styles.cards}>
              {filtered.map((order) => (
                <article key={order.id} className={styles.card}>
                  <div className={styles.cardHead}>
                    <div><span className={styles.number}>#{order.number}</span><small>{formatTime(order.createdAt)}</small></div>
                    <span className={`${styles.status} ${styles[order.status.toLowerCase()]}`}>{labels[order.status]}</span>
                  </div>
                  <h2>{order.customer.name}</h2>
                  <p className={styles.address}>⌖ {order.customer.address}</p>
                  <div className={styles.cardMeta}>
                    <span>{order.itemCount} قطعة</span>
                    <span>{payments[order.paymentMethod]}</span>
                    <strong>{formatMoney(order.totalFils)}</strong>
                  </div>
                  {order.bookletRequestStatus && order.bookletRequestStatus !== "CANCELLED" && (
                    <p className={styles.bookletNote}>دفتر جديد مطلوب — تأكيد بيع الدفتر واعتماد رقمه سيتمان في مرحلة الإدارة التالية، ولم يُحتسب ثمنه الآن.</p>
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
          <p className={styles.footerNote}>تظهر طلبات تاريخ {day ? `${day.slice(0, 4)}/${day.slice(4, 6)}/${day.slice(6, 8)}` : "اليوم"} فقط بتوقيت الأردن. سجل الطلبات السابق خاص بالإدارة.</p>
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
              <a href={`tel:${selectedOrder.customer.phone}`}>اتصال: {readablePhone(selectedOrder.customer.phone)}</a>
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
              {selectedOrder.bookletRequestStatus && <p className={styles.bookletNote}>حالة الدفتر: {selectedOrder.bookletRequestStatus === "HANDED_OVER" ? "تم البيع والتسليم وبانتظار اعتماد الإدارة" : selectedOrder.bookletRequestStatus === "APPROVED" ? "تم اعتماد الدفتر من الإدارة" : "دفتر جديد مطلوب — لا يتم اعتماده إلا من الإدارة بعد تسليمه وبيعه فعليًا"}. {selectedOrder.bookletRequestStatus === "REQUESTED" && bookletPriceFils !== null ? `سعر الدفتر ${formatMoney(bookletPriceFils)}.` : ""}</p>}
            </div>
            <div className={styles.detailActions}>
              {selectedOrder.status === "NEW" && <button type="button" disabled={busyId !== null} onClick={() => void changeStatus(selectedOrder, "READY")}>تأكيد تجهيز الطلب</button>}
              {selectedOrder.status === "READY" && <button type="button" disabled={busyId !== null} onClick={() => void changeStatus(selectedOrder, "DELIVERED")}>تأكيد التسليم والتحصيل</button>}
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
        confirmDisabled={actionDialog?.kind === "BOOKLET" && !bookletPayment}
        choices={actionDialog?.kind === "BOOKLET" ? [
          { value: "CASH", label: "كاش", description: "تحصيل نقدي" },
          { value: "CLICK", label: "كليك", description: "تحصيل إلكتروني" },
        ] : undefined}
        selectedChoice={bookletPayment}
        onChoiceChange={(value) => setBookletPayment(value === "CASH" ? "CASH" : "CLICK")}
        onClose={() => { if (busyId === null) { setActionDialog(null); setError(""); } }}
        onConfirm={() => {
          if (!dialogOrder || !actionDialog) return;
          if (actionDialog.kind === "BOOKLET") {
            if (bookletPayment) void executeBooklet(dialogOrder, bookletPayment);
          } else if (actionDialog.action) {
            void executeStatus(dialogOrder, actionDialog.action);
          }
        }}
      >
        {error && <p role="alert" style={{ color: "#e15b61", fontWeight: 800 }}>{error}</p>}
      </ActionModal>
    </main>
  );
}
