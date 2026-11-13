import "server-only";

import { registerCanonicalBooklet } from "./booklet-serials";
import { BookletError } from "./booklet-error";
export { BookletError } from "./booklet-error";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { getFirebaseAdminFirestore } from "@/lib/firebase/admin";
import {
  ACTIVE_STORE_SHIFTS_COLLECTION,
  getActiveStoreShiftDocumentId,
  SHIFT_STATUSES,
} from "@/lib/shifts/shift-repository";

const db = () => getFirebaseAdminFirestore();
const BOOKLETS = "couponBooklets";
const ORDERS = "deliveryOrders";
const SETTINGS = "couponBookletSettings";
const SALES = "couponBookletSales";
const EVENTS = "couponBookletTransactions";
const MAX_COUPONS = 22;

type Order = {
  status: string;
  orderDateKey?: string;
  customerId: string;
  customerNameSnapshot?: string;
  employeeId?: string;
  orderNumber?: string;
  storeAuthUid?: string;
  paymentState?: string;
  pendingCouponQuantity?: number;
  couponAllocations?: Array<{ bookletId: string; quantity: number }>;
  bookletRequest?: { status: string; priceFils?: number; paymentMethod?: string } | null;
};

type Booklet = {
  serial: string;
  status: "IN_STOCK" | "ACTIVE" | "EXHAUSTED";
  customerId: string | null;
  orderId?: string | null;
  issuedCoupons: number;
  remainingCoupons: number;
  reservedCoupons: number;
  createdAt?: Timestamp;
  activatedAt?: Timestamp;
  updatedAt?: Timestamp;
};


function iso(value: unknown): string | null {
  return value instanceof Timestamp ? value.toDate().toISOString() : null;
}

function dto(id: string, data: Booklet) {
  return {
    id,
    serial: data.serial,
    status: data.status === "ACTIVE" && data.remainingCoupons === 0 ? "EXHAUSTED" : data.status,
    customerId: data.customerId ?? null,
    orderId: data.orderId ?? null,
    issuedCoupons: data.issuedCoupons ?? 22,
    remainingCoupons: data.remainingCoupons ?? 0,
    reservedCoupons: data.reservedCoupons ?? 0,
    createdAt: iso(data.createdAt),
    activatedAt: iso(data.activatedAt),
  };
}

export async function getAdminCouponDashboard(cursor?: string) {
  const database = db();
  let query = database.collection(BOOKLETS).orderBy("createdAt", "desc").limit(101);
  if (cursor) {
    const cursorDoc = await database.collection(BOOKLETS).doc(cursor).get();
    if (!cursorDoc.exists || !(cursorDoc.data()?.createdAt instanceof Timestamp)) {
      throw new BookletError("INVALID_CURSOR", "انتهت صلاحية صفحة الدفاتر، حدّث القائمة.");
    }
    query = query.startAfter(cursorDoc);
  }
  const [inventory, requests, settings, sales] = await Promise.all([
    query.get(),
    database.collection(ORDERS).where("bookletRequest.status", "in", ["REQUESTED", "HANDED_OVER"]).limit(200).get(),
    database.collection(SETTINGS).doc("standard").get(),
    database.collection(SALES).orderBy("createdAt", "desc").limit(60).get(),
  ]);

  return {
    priceFils: typeof settings.data()?.priceFils === "number" ? settings.data()!.priceFils as number : null,
    booklets: inventory.docs.slice(0, 100).map((d) => dto(d.id, d.data() as Booklet)),
    hasMore: inventory.size > 100,
    nextCursor: inventory.size > 100 ? (inventory.docs[99]?.id ?? null) : null,
    requests: requests.docs.map((d) => {
      const order = d.data() as Order;
      const request = order.bookletRequest;
      return {
        orderId: d.id,
        orderNumber: order.orderNumber ?? "",
        customerId: order.customerId ?? "",
        customerName: order.customerNameSnapshot ?? "",
        status: order.status ?? "",
        requestStatus: request?.status ?? "",
        pendingCoupons: order.pendingCouponQuantity ?? 0,
        priceFils: request?.priceFils ?? null,
        paymentMethod: request?.paymentMethod ?? null,
      };
    }).sort((a, b) => b.orderId.localeCompare(a.orderId)),
    sales: sales.docs.map((d) => {
      const data = d.data();
      return {
        orderId: d.id,
        customerId: data.customerId as string,
        employeeName: String(data.employeeNameSnapshot ?? "الإدارة"),
        channel: data.channel ?? "DELIVERY",serial: data.serial ?? "",financialDate:data.financialDate??"",financialPeriod:data.financialPeriod??"",
        priceFils: data.priceFils as number,
        paymentMethod: data.paymentMethod as string,
        createdAt: iso(data.createdAt),
      };
    }),
    truncated: requests.size === 200 || sales.size === 60,
  };
}

export async function updateBookletPrice(priceFils: number, adminUid: string) {
  if (!Number.isSafeInteger(priceFils) || priceFils <= 0 || priceFils > 1_000_000) {
    throw new BookletError("INVALID_PRICE", "أدخل سعر دفتر صحيحًا بالفلس.");
  }
  await db().collection(SETTINGS).doc("standard").set({ priceFils, updatedByAdminUid: adminUid, updatedAt: Timestamp.now() }, { merge: true });
}

export async function registerPhysicalBooklet(serialInput: string, adminUid: string) { return registerCanonicalBooklet(serialInput, adminUid); }

// Only the current employee may attest that the physical booklet was handed over
// and its configured price was collected. The serial remains ADMIN-ONLY.
export async function confirmBookletHandover(
  orderId: string,
  actor: { employeeId: string; employeeName: string; storeAuthUid: string },
  paymentMethod: "CASH" | "CLICK",
  expectedPriceFils: number,
) {
  const database = db();
  const orderRef = database.collection(ORDERS).doc(orderId);
  const activeShiftRef = database.collection(ACTIVE_STORE_SHIFTS_COLLECTION)
    .doc(getActiveStoreShiftDocumentId(actor.storeAuthUid));
  const saleRef = database.collection(SALES).doc(orderId);
  const settingsRef = database.collection(SETTINGS).doc("standard");
  return database.runTransaction(async (tx) => {
    const [orderDoc, settingsDoc, activeShiftDoc, existingSale] = await Promise.all([
      tx.get(orderRef), tx.get(settingsRef), tx.get(activeShiftRef), tx.get(saleRef),
    ]);
    if (!orderDoc.exists) throw new BookletError("NOT_FOUND", "الطلب غير موجود.");
    const order = orderDoc.data() as Order;
    if (order.storeAuthUid !== actor.storeAuthUid) throw new BookletError("NOT_FOUND", "الطلب غير موجود.");
    if (order.bookletRequest?.status === "HANDED_OVER" && existingSale.exists) {
      return { unchanged: true };
    }
    if (order.status !== "DELIVERED" || order.bookletRequest?.status !== "REQUESTED") {
      throw new BookletError("INVALID_STATE", "يجب تسليم الطلب أولًا قبل تأكيد تسليم الدفتر.");
    }
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Amman", year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(new Date());
    const dayPart = (type: string) => parts.find(p => p.type === type)?.value ?? "";
    const today = `${dayPart("year")}${dayPart("month")}${dayPart("day")}`;
    if (order.orderDateKey !== today) {
      throw new BookletError("NOT_TODAY", "هذا الطلب خارج تاريخ اليوم؛ راجع الإدارة لمعالجة تسليم الدفتر.");
    }
    if (existingSale.exists) throw new BookletError("ALREADY_SOLD", "تم تسجيل بيع الدفتر لهذا الطلب من قبل.");
    const priceFils = settingsDoc.data()?.priceFils;
    if (!Number.isSafeInteger(priceFils) || priceFils <= 0) {
      throw new BookletError("PRICE_REQUIRED", "سعر دفتر الكوبونات غير محدد عند الإدارة.");
    }
    if (priceFils !== expectedPriceFils) {
      throw new BookletError("PRICE_CHANGED", "تغيّر سعر الدفتر. حدّث صفحة الطلبات قبل تأكيد تحصيل الثمن.");
    }
    const customerDoc = await tx.get(database.collection("customers").doc(order.customerId));
    const customerRecord = customerDoc.data();
    if (!customerRecord || customerRecord.isArchived) {
      throw new BookletError("CUSTOMER_UNAVAILABLE", "العميل غير متاح.");
    }
    if (customerRecord.pendingBookletSaleOrderId) {
      throw new BookletError("PENDING_BOOKLET", "يوجد دفتر آخر للعميل بانتظار اعتماد الإدارة. لا يمكن بيع دفتر ثانٍ الآن.");
    }
    const bookletDocs = await tx.get(database.collection(BOOKLETS).where("customerId", "==", order.customerId));
    const existingCoupons = bookletDocs.docs.reduce((count, entry) => {
      const b = entry.data();
      return b.status === "ACTIVE" && Number.isSafeInteger(b.remainingCoupons)
        ? count + b.remainingCoupons : count;
    }, 0);
    void existingCoupons;
    const shiftId = activeShiftDoc.data()?.shiftId as string | undefined;
    if (!shiftId) throw new BookletError("NO_SHIFT", "يجب فتح شفت لتحصيل ثمن الدفتر.");
    const shiftRef = database.collection("shifts").doc(shiftId);
    const shiftDoc = await tx.get(shiftRef);
    const shift = shiftDoc.data();
    if (!shift || shift.status !== SHIFT_STATUSES.OPEN || shift.openedByEmployeeId !== actor.employeeId) {
      throw new BookletError("NO_SHIFT", "الشفت المفتوح لا يخص الموظف الحالي.");
    }
    const now = Timestamp.now();
    tx.update(database.collection("customers").doc(order.customerId), { pendingBookletSaleOrderId: orderId, updatedAt: now });
    tx.create(saleRef, {
      orderId, customerId: order.customerId, shiftId,
      employeeId: actor.employeeId, employeeNameSnapshot: actor.employeeName,
      storeAuthUid: actor.storeAuthUid, priceFils, paymentMethod, createdAt: now,
    });
    tx.update(shiftRef, {
      saleCount: FieldValue.increment(1),
      totalSalesFils: FieldValue.increment(priceFils),
      cashSalesFils: FieldValue.increment(paymentMethod === "CASH" ? priceFils : 0),
      clickSalesFils: FieldValue.increment(paymentMethod === "CLICK" ? priceFils : 0),
      updatedAt: now,
    });
    tx.update(orderRef, {
      "bookletRequest.status": "HANDED_OVER",
      "bookletRequest.handedOverAt": now,
      "bookletRequest.handedOverByEmployeeId": actor.employeeId,
      "bookletRequest.handedOverByEmployeeName": actor.employeeName,
      "bookletRequest.priceFils": priceFils,
      "bookletRequest.paymentMethod": paymentMethod,
      "bookletRequest.saleShiftId": shiftId,
      updatedAt: now,
    });
    return { unchanged: false };
  });
}

export async function approveBookletRequest(orderId: string, bookletId: string, adminUid: string) {
  const database = db();
  const orderRef = database.collection(ORDERS).doc(orderId);
  const bookletRef = database.collection(BOOKLETS).doc(bookletId);
  const saleRef = database.collection(SALES).doc(orderId);
  return database.runTransaction(async (tx) => {
    const [orderDoc, bookletDoc, saleDoc] = await Promise.all([
      tx.get(orderRef), tx.get(bookletRef), tx.get(saleRef),
    ]);
    if (!orderDoc.exists || !bookletDoc.exists) {
      throw new BookletError("NOT_FOUND", "الطلب أو الدفتر غير موجود.");
    }
    const order = orderDoc.data() as Order;
    const booklet = bookletDoc.data() as Booklet;
    if (order.bookletRequest?.status === "APPROVED" && booklet.orderId === orderId) {
      return { unchanged: true };
    }
    if (order.status !== "DELIVERED" || order.bookletRequest?.status !== "HANDED_OVER") {
      throw new BookletError("INVALID_STATE", "يلزم تسليم الطلب والدفتر وتسجيل تحصيل ثمنه قبل الاعتماد.");
    }
    if (!saleDoc.exists || saleDoc.data()?.customerId !== order.customerId ||
        saleDoc.data()?.priceFils !== order.bookletRequest?.priceFils) {
      throw new BookletError("SALE_MISMATCH", "بيانات تحصيل الدفتر غير متطابقة.");
    }
    if (booklet.status !== "IN_STOCK" || booklet.customerId !== null || booklet.remainingCoupons !== 0) {
      throw new BookletError("BOOKLET_UNAVAILABLE", "هذا الدفتر غير متاح للاعتماد.");
    }
    const customerRef = database.collection("customers").doc(order.customerId);
    const [customerDoc, activeBooklets] = await Promise.all([
      tx.get(customerRef),
      tx.get(database.collection(BOOKLETS).where("customerId", "==", order.customerId)),
    ]);
    const customer = customerDoc.data();
    if (!customer || customer.isArchived) throw new BookletError("CUSTOMER_UNAVAILABLE", "العميل غير متاح.");
    if (customer.pendingBookletSaleOrderId !== orderId) {
      throw new BookletError("BOOKLET_LOCK", "ربط بيع الدفتر بالعميل غير متطابق. راجع الإدارة.");
    }
    let existing = 0;
    for (const document of activeBooklets.docs) {
      const row = document.data() as Booklet;
      if (row.status === "ACTIVE") {
        if (!Number.isSafeInteger(row.remainingCoupons) || row.remainingCoupons < 0 ||
            !Number.isSafeInteger(row.reservedCoupons) || row.reservedCoupons > row.remainingCoupons) {
          throw new BookletError("INVALID_BALANCE", "بيانات أحد دفاتر العميل غير متسقة.");
        }
        existing += row.remainingCoupons;
      }
    }
    // The limit is per physical booklet, never the combined customer balance.
    void existing;
    const pending = order.pendingCouponQuantity ?? 0;
    if (!Number.isSafeInteger(pending) || pending < 0 ||
        (pending > 0 && order.paymentState !== "AWAITING_BOOKLET_APPROVAL")) {
      throw new BookletError("INVALID_PENDING", "كمية الكوبونات المعلقة غير متسقة.");
    }
    const now = Timestamp.now();
    const consumed = Math.min(MAX_COUPONS, pending);
    const stillDue = pending - consumed;
    const debtRef = database.collection("customerReceivables").doc(`order_${orderId}`);
    const debtDoc = await tx.get(debtRef);
    const debt = debtDoc.data();
    if (debt && (debt.kind !== "COUPON" || debt.customerId !== order.customerId || debt.outstanding !== pending || !Number.isSafeInteger(debt.settled) || debt.settled < 0 || !Number.isSafeInteger(debt.original) || debt.original !== debt.settled + pending)) throw new BookletError("INVALID_PENDING", "رصيد المستحق غير متطابق مع الطلب.");
    const remaining = MAX_COUPONS - consumed;
    tx.update(bookletRef, {
      status: remaining > 0 ? "ACTIVE" : "EXHAUSTED",
      customerId: order.customerId, orderId,
      issuedCoupons: MAX_COUPONS,
      remainingCoupons: remaining,
      reservedCoupons: 0,
      activatedAt: now,
      approvedByAdminUid: adminUid,
      updatedAt: now,
    });
    tx.update(orderRef, {
      "bookletRequest.status": "APPROVED",
      "bookletRequest.bookletId": bookletId,
      "bookletRequest.approvedByAdminUid": adminUid,
      "bookletRequest.approvedAt": now,
      pendingCouponQuantity: stillDue,
      ...(order.paymentState === "AWAITING_BOOKLET_APPROVAL" ? { paymentState: stillDue ? "AWAITING_BOOKLET_APPROVAL" : "COUPONS_SETTLED" } : {}),
      updatedAt: now,
    });
    if (debt) tx.update(debtRef, { outstanding: stillDue, settled: debt.settled + consumed, status: stillDue ? "OPEN" : "SETTLED", updatedAt: now, lastSettledByAdminUid: adminUid });
    // This write serializes concurrent approvals for the same customer.
    tx.update(customerRef, { pendingBookletSaleOrderId: FieldValue.delete(), updatedAt: now });
    tx.create(database.collection(EVENTS).doc(`ISSUE_${orderId}`), {
      type: "BOOKLET_ISSUED", bookletId, customerId: order.customerId, orderId,
      quantity: MAX_COUPONS, adminUid, createdAt: now,
    });
    if (pending > 0) {
      tx.create(database.collection(EVENTS).doc(`DEBIT_${orderId}`), {
        type: "ORDER_DEBIT", bookletId, customerId: order.customerId, orderId,
        quantity: consumed, adminUid, createdAt: now,
      });
    }
    return { unchanged: false, remaining, consumed };
  });
}

export async function getCustomerOperations(customerId: string) {
  const database = db();
  const [orders, booklets, legacyTransactions] = await Promise.all([
    database.collection(ORDERS).where("customerId", "==", customerId).limit(151).get(),
    database.collection(BOOKLETS).where("customerId", "==", customerId).limit(101).get(),
    database.collection(EVENTS).where("customerId", "==", customerId).limit(151).get(),
  ]);
  const orderRows = orders.docs.map((d) => {
    const o = d.data() as Order & {
      createdAt?: Timestamp; paymentMethod?: string; totalFils?: number;
      deliveredAt?: Timestamp; statusHistory?: Array<{ status: string; actorName?: string; at?: Timestamp }>;
    };
    return {
      id: d.id, number: o.orderNumber ?? "", status: o.status ?? "",
      paymentMethod: o.paymentMethod ?? "", totalFils: o.totalFils ?? 0,
      createdAt: iso(o.createdAt), deliveredAt: iso(o.deliveredAt),
      bookletRequestStatus: o.bookletRequest?.status ?? null,
      history: (o.statusHistory ?? []).map((h) => ({ status: h.status, actorName: h.actorName ?? "", at: iso(h.at) })),
    };
  }).sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "")).slice(0, 150);
  const bookletRows = booklets.docs.map((d) => dto(d.id, d.data() as Booklet))
    .sort((a, b) => (b.activatedAt ?? b.createdAt ?? "").localeCompare(a.activatedAt ?? a.createdAt ?? ""));
  const events = legacyTransactions.docs.map((d) => {
    const row = d.data();
    return { id: d.id, bookletId: row.bookletId as string,
      type: row.type as string, quantity: row.quantity as number,
      orderId: row.orderId as string | undefined, createdAt: iso(row.createdAt) };
  }).sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "")).slice(0, 150);
  return { orders: orderRows, booklets: bookletRows, events,
    truncated: orders.size === 151 || booklets.size === 101 || legacyTransactions.size === 151 };
}

// Aggregation query for the true order count displayed in customer profile.
export async function countCustomerDeliveryOrders(customerId: string): Promise<number> {
  const result = await db().collection(ORDERS).where("customerId", "==", customerId).count().get();
  return result.data().count;
}

/**
 * Admin-only physical assignment. This is NOT a cash sale and never
 * increments shifts or sales collections. Records an automatic action description.
 * The physical serial stays unchanged and is immutable after assignment.
 */
export async function assignBookletToCustomer(input: {
  customerId: string;
  bookletId: string;
  reason: string;
  adminUid: string;
}) {
  const database = db();
  const customerRef = database.collection("customers").doc(input.customerId);
  const bookletRef = database.collection(BOOKLETS).doc(input.bookletId);
  const eventRef = database.collection(EVENTS).doc(`ISSUE_ADMIN_${input.bookletId}`);
  return database.runTransaction(async (tx) => {
    const [customerSnapshot, bookletSnapshot, previouslyIssued, customerBooklets] = await Promise.all([
      tx.get(customerRef),
      tx.get(bookletRef),
      tx.get(eventRef),
      tx.get(database.collection(BOOKLETS).where("customerId", "==", input.customerId)),
    ]);
    const customer = customerSnapshot.data();
    const booklet = bookletSnapshot.data() as Booklet | undefined;
    if (!customer || customer.isArchived) throw new BookletError("CUSTOMER_UNAVAILABLE", "العميل غير متاح.");
    if (customer.pendingBookletSaleOrderId) throw new BookletError("PENDING_SALE", "يوجد دفتر مباع ينتظر اعتماد الإدارة لهذا العميل.");
    if (previouslyIssued.exists || !bookletSnapshot.exists || !booklet || booklet.status !== "IN_STOCK" ||
        booklet.customerId !== null || booklet.remainingCoupons !== 0) {
      throw new BookletError("BOOKLET_UNAVAILABLE", "هذا الدفتر غير متاح للإصدار الإداري.");
    }
    let totalRemaining = 0;
    for (const doc of customerBooklets.docs) {
      const record = doc.data() as Booklet;
      if (record.status !== "ACTIVE") continue;
      if (!Number.isSafeInteger(record.remainingCoupons) || record.remainingCoupons < 0 ||
          !Number.isSafeInteger(record.reservedCoupons) || record.reservedCoupons > record.remainingCoupons) {
        throw new BookletError("INVALID_BALANCE", "رصيد أحد دفاتر العميل غير متسق.");
      }
      totalRemaining += record.remainingCoupons;
    }
    void totalRemaining;
    const now = Timestamp.now();
    tx.update(bookletRef, {
      status: "ACTIVE", customerId: input.customerId, orderId: null,
      issuedCoupons: MAX_COUPONS, remainingCoupons: MAX_COUPONS, reservedCoupons: 0,
      activatedAt: now, updatedAt: now, approvedByAdminUid: input.adminUid,
      issueSource: "ADMIN_ASSIGNMENT", issueReason: input.reason,
    });
    tx.update(customerRef, { updatedAt: now, updatedByAuthUid: input.adminUid });
    tx.create(eventRef, {
      type: "BOOKLET_ISSUED", bookletId: input.bookletId,
      customerId: input.customerId, orderId: null, quantity: MAX_COUPONS,
      adminUid: input.adminUid, source: "ADMIN_ASSIGNMENT",
      reason: input.reason, createdAt: now,
    });
    return { bookletId: input.bookletId, remaining: MAX_COUPONS };
  });
}

/** Dashboard list summary, using numbered ACTIVE booklets only. */
export async function getActiveBookletBalances(): Promise<Map<string, number>> {
  const snapshot = await db().collection(BOOKLETS)
    .where("status", "==", "ACTIVE")
    .select("customerId", "remainingCoupons")
    .get();
  const totals = new Map<string, number>();
  for (const doc of snapshot.docs) {
    const { customerId, remainingCoupons } = doc.data();
    if (typeof customerId !== "string" ||
        !Number.isSafeInteger(remainingCoupons) || remainingCoupons < 0 || remainingCoupons > MAX_COUPONS) continue;
    totals.set(customerId, (totals.get(customerId) ?? 0) + remainingCoupons);
  }
  return totals;
}
