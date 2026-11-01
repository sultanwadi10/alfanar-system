import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { normalizeJordanPhone } from "@/lib/customers/customer-phone";
import { getFirebaseAdminFirestore } from "@/lib/firebase/admin";
import { DeliveryOrderBusinessError } from "@/lib/orders/delivery-order-repository";
import {
  ACTIVE_STORE_SHIFTS_COLLECTION,
  getActiveStoreShiftDocumentId,
  SHIFT_STATUSES,
} from "@/lib/shifts/shift-repository";

const ORDERS = "deliveryOrders";
const PAGE_SIZE = 40;
const DAY_LIMIT = 750;
const SEARCH_LIMIT = 60;

type Allocation = { bookletId: string; quantity: number };

type HistoryEvent = {
  status: string;
  actorType?: string;
  actorId?: string;
  actorName?: string;
  reason?: string;
  at?: Timestamp;
};

type StoredOrder = {
  storeAuthUid: string;
  shiftId?: string;
  orderDateKey: string;
  orderNumber: string;
  status: string;
  customerId: string;
  customerNameSnapshot: string;
  customerPhoneSnapshot: string;
  deliveryAddress: string;
  notes?: string;
  employeeId?: string;
  employeeNameSnapshot?: string;
  items?: Array<{
    productId: string;
    productNameSnapshot: string;
    category: string;
    bottleOrigin: "JORDANIAN" | "SAUDI" | null;
    quantity: number;
    unitPriceFils: number;
    lineTotalFils: number;
  }>;
  itemCount?: number;
  totalFils: number;
  paymentMethod: "CASH" | "CLICK" | "COUPON";
  paymentState: string;
  collectedFils?: number;
  couponQuantity?: number;
  pendingCouponQuantity?: number;
  couponAllocations?: Allocation[];
  bookletRequest?: { status?: string; requestedAt?: Timestamp } | null;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
  readyAt?: Timestamp | null;
  deliveredAt?: Timestamp | null;
  cancelledAt?: Timestamp | null;
  cancelReason?: string;
  statusHistory?: HistoryEvent[];
};

function iso(value: unknown): string | null {
  return value instanceof Timestamp ? value.toDate().toISOString() : null;
}

function toDto(id: string, order: StoredOrder) {
  return {
    id,
    number: order.orderNumber ?? id,
    day: order.orderDateKey ?? "",
    status: order.status ?? "NEW",
    customerId: order.customerId ?? "",
    customerName: order.customerNameSnapshot ?? "",
    customerPhone: order.customerPhoneSnapshot ?? "",
    address: order.deliveryAddress ?? "",
    notes: order.notes ?? "",
    createdBy: order.employeeNameSnapshot ?? "غير محدد",
    items: (order.items ?? []).map((item) => ({
      name: item.productNameSnapshot ?? "منتج",
      category: item.category ?? "",
      origin: item.bottleOrigin ?? null,
      quantity: item.quantity ?? 0,
      unitPriceFils: item.unitPriceFils ?? 0,
      lineTotalFils: item.lineTotalFils ?? 0,
    })),
    itemCount: order.itemCount ?? 0,
    totalFils: order.totalFils ?? 0,
    paymentMethod: order.paymentMethod ?? "CASH",
    paymentState: order.paymentState ?? "",
    collectedFils: order.collectedFils ?? 0,
    couponQuantity: order.couponQuantity ?? 0,
    reservedCouponQuantity: (order.couponAllocations ?? []).reduce(
      (sum, item) => sum + (item.quantity ?? 0), 0,
    ),
    pendingCouponQuantity: order.pendingCouponQuantity ?? 0,
    bookletRequestStatus: order.bookletRequest?.status ?? null,
    createdAt: iso(order.createdAt),
    updatedAt: iso(order.updatedAt),
    readyAt: iso(order.readyAt),
    deliveredAt: iso(order.deliveredAt),
    cancelledAt: iso(order.cancelledAt),
    cancelReason: order.cancelReason ?? null,
    history: (order.statusHistory ?? []).map((event) => ({
      status: event.status ?? "",
      actorType: event.actorType ?? "",
      actorName: event.actorName ?? "غير معروف",
      reason: event.reason ?? null,
      at: iso(event.at),
    })),
  };
}

export type AdminOrder = ReturnType<typeof toDto>;

export function jordanDayKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Amman", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const read = (part: string) => parts.find((item) => item.type === part)?.value ?? "";
  return `${read("year")}${read("month")}${read("day")}`;
}

function sortRecent(items: AdminOrder[]) {
  return items.sort((a, b) =>
    (b.createdAt ?? "").localeCompare(a.createdAt ?? "") || b.id.localeCompare(a.id),
  );
}

export async function listAdminOrders(input: {
  view: "today" | "date" | "recent" | "search";
  day?: string;
  cursor?: string;
  query?: string;
}) {
  const db = getFirebaseAdminFirestore();
  const orders = db.collection(ORDERS);

  if (input.view === "today" || input.view === "date") {
    const day = input.view === "today" ? jordanDayKey() : input.day!;
    // Single-field query intentionally avoids deployment-time composite indexes.
    const snapshot = await orders.where("orderDateKey", "==", day).limit(DAY_LIMIT).get();
    return {
      orders: sortRecent(snapshot.docs.map((doc) => toDto(doc.id, doc.data() as StoredOrder))),
      day,
      limitReached: snapshot.size === DAY_LIMIT,
      hasMore: false,
      nextCursor: null as string | null,
    };
  }

  if (input.view === "recent") {
    let query = orders.orderBy("createdAt", "desc").limit(PAGE_SIZE + 1);
    if (input.cursor) {
      const cursorDoc = await orders.doc(input.cursor).get();
      if (!cursorDoc.exists || !(cursorDoc.data()?.createdAt instanceof Timestamp)) {
        throw new DeliveryOrderBusinessError("INVALID_CURSOR", "انتهت صلاحية صفحة النتائج. أعد تحميل السجل.");
      }
      query = query.startAfter(cursorDoc);
    }
    const result = await query.get();
    const page = result.docs.slice(0, PAGE_SIZE);
    return {
      orders: page.map((doc) => toDto(doc.id, doc.data() as StoredOrder)),
      day: null as string | null,
      limitReached: false,
      hasMore: result.size > PAGE_SIZE,
      nextCursor: result.size > PAGE_SIZE ? (page.at(-1)?.id ?? null) : null,
    };
  }

  const raw = (input.query ?? "").trim();
  const normalizedPhone = normalizeJordanPhone(raw);
  const exactOrderId = /^\d{8}-\d{3,8}$/.test(raw);
  let results: FirebaseFirestore.QueryDocumentSnapshot[] = [];
  let exact: AdminOrder[] = [];

  if (exactOrderId) {
    const doc = await orders.doc(raw).get();
    if (doc.exists) exact = [toDto(doc.id, doc.data() as StoredOrder)];
  } else if (normalizedPhone) {
    const snapshot = await orders.where("customerPhoneSnapshot", "==", normalizedPhone)
      .limit(SEARCH_LIMIT).get();
    results = snapshot.docs;
  } else {
    // Name prefix search. For contains/partial-number search, use a dated view.
    const snapshot = await orders.orderBy("customerNameSnapshot")
      .startAt(raw).endAt(`${raw}\uf8ff`).limit(SEARCH_LIMIT).get();
    results = snapshot.docs;
  }

  return {
    orders: sortRecent(exact.length ? exact : results.map((doc) => toDto(doc.id, doc.data() as StoredOrder))),
    day: null as string | null,
    limitReached: results.length === SEARCH_LIMIT,
    hasMore: false,
    nextCursor: null as string | null,
  };
}

export async function changeAdminDeliveryOrderStatus(
  orderId: string,
  action: "DELIVERED" | "CANCELLED",
  adminUid: string,
  input: { paymentCollected: boolean; reason: string },
) {
  const db = getFirebaseAdminFirestore();
  const orderRef = db.collection(ORDERS).doc(orderId);

  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(orderRef);
    if (!snapshot.exists) {
      throw new DeliveryOrderBusinessError("NOT_FOUND", "الطلب غير موجود.");
    }
    const order = snapshot.data() as StoredOrder;
    if (order.status === action) {
      return { id: orderId, status: action, unchanged: true };
    }
    const valid = action === "DELIVERED"
      ? order.status === "READY"
      : order.status === "NEW" || order.status === "READY";
    if (!valid) {
      throw new DeliveryOrderBusinessError("INVALID_TRANSITION", "لا يمكن إجراء هذا التغيير على الحالة الحالية. حدّث الصفحة.");
    }

    if (action === "DELIVERED" && !["CASH", "CLICK", "COUPON"].includes(order.paymentMethod)) {
      throw new DeliveryOrderBusinessError("INVALID_PAYMENT", "طريقة دفع الطلب غير معروفة. راجع البيانات قبل الاعتماد.");
    }

    const allocations = order.couponAllocations ?? [];
    const neededBooklets = action === "CANCELLED" || (action === "DELIVERED" && order.paymentMethod === "COUPON");
    const bookletDocs = neededBooklets
      ? await Promise.all(allocations.map((a) => tx.get(db.collection("couponBooklets").doc(a.bookletId))))
      : [];

    let shiftRef: FirebaseFirestore.DocumentReference | null = null;
    if (action === "DELIVERED" && order.paymentMethod !== "COUPON") {
      if (!input.paymentCollected) {
        throw new DeliveryOrderBusinessError("PAYMENT_REQUIRED", "يجب تأكيد تسلّم قيمة الطلب قبل تسجيل التسليم.");
      }
      if (!order.shiftId || !order.storeAuthUid) {
        throw new DeliveryOrderBusinessError("SHIFT_MISSING", "تعذر تحديد شفت الطلب. يلزم مراجعة الإدارة المالية.");
      }
      const indexRef = db.collection(ACTIVE_STORE_SHIFTS_COLLECTION)
        .doc(getActiveStoreShiftDocumentId(order.storeAuthUid));
      const indexDoc = await tx.get(indexRef);
      if (indexDoc.data()?.shiftId !== order.shiftId) {
        throw new DeliveryOrderBusinessError(
          "SHIFT_CLOSED", "الشفت الذي يتبعه الطلب لم يعد مفتوحًا. لا يمكن تسجيل التحصيل على شفت مختلف أو مغلق.",
        );
      }
      shiftRef = db.collection("shifts").doc(order.shiftId);
      const shiftDoc = await tx.get(shiftRef);
      const shift = shiftDoc.data();
      if (!shift || shift.status !== SHIFT_STATUSES.OPEN || shift.storeAuthUid !== order.storeAuthUid) {
        throw new DeliveryOrderBusinessError("SHIFT_CLOSED", "شفت الطلب مغلق أو غير صالح للتحصيل.");
      }
      if (!Number.isSafeInteger(order.totalFils) || order.totalFils < 0) {
        throw new DeliveryOrderBusinessError("INVALID_AMOUNT", "قيمة الطلب غير صالحة.");
      }
    }

    if (neededBooklets) {
      for (let i = 0; i < allocations.length; i++) {
        const allocation = allocations[i];
        const booklet = bookletDocs[i];
        const data = booklet?.data();
        if (!allocation || !data || data.customerId !== order.customerId ||
            !Number.isSafeInteger(allocation.quantity) || allocation.quantity < 1 ||
            !Number.isSafeInteger(data.reservedCoupons) || data.reservedCoupons < allocation.quantity ||
            (action === "DELIVERED" &&
              (!Number.isSafeInteger(data.remainingCoupons) || data.remainingCoupons < allocation.quantity))) {
          throw new DeliveryOrderBusinessError("COUPON_INCONSISTENT", "تعذر تسوية الكوبونات. يجب مراجعة الإدارة قبل تغيير حالة الطلب.");
        }
      }
    }

    // ALL reads completed before any writes. Transaction retry safely prevents
    // double settlement if an employee or another admin clicks simultaneously.
    const now = Timestamp.now();
    const patch: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData> = {
      status: action,
      updatedAt: now,
      statusHistory: FieldValue.arrayUnion({
        status: action,
        actorType: "ADMIN",
        actorId: adminUid,
        actorName: "الإدارة",
        ...(action === "CANCELLED" ? { reason: input.reason.trim() } : {}),
        at: now,
      }),
    };

    if (action === "CANCELLED") {
      patch.cancelledAt = now;
      patch.cancelledByAdminUid = adminUid;
      patch.cancelReason = input.reason.trim();
      patch.paymentState = "CANCELLED";
      if (order.bookletRequest?.status === "REQUESTED") {
        patch["bookletRequest.status"] = "CANCELLED";
        patch["bookletRequest.cancelledAt"] = now;
      }
      for (const allocation of allocations) {
        tx.update(db.collection("couponBooklets").doc(allocation.bookletId), {
          reservedCoupons: FieldValue.increment(-allocation.quantity), updatedAt: now,
        });
      }
    } else {
      patch.deliveredAt = now;
      patch.deliveredByAdminUid = adminUid;
      patch.deliveredByAdminName = "الإدارة";

      if (order.paymentMethod === "COUPON") {
        for (const allocation of allocations) {
          tx.update(db.collection("couponBooklets").doc(allocation.bookletId), {
            reservedCoupons: FieldValue.increment(-allocation.quantity),
            remainingCoupons: FieldValue.increment(-allocation.quantity),
            updatedAt: now,
          });
          const logRef = db.collection("couponBookletTransactions").doc();
          tx.create(logRef, {
            bookletId: allocation.bookletId,
            customerId: order.customerId,
            orderId,
            type: "ORDER_DEBIT",
            quantity: allocation.quantity,
            adminUid,
            createdAt: now,
          });
        }
        patch.paymentState = (order.pendingCouponQuantity ?? 0) > 0
          ? "AWAITING_BOOKLET_APPROVAL" : "COUPONS_SETTLED";
      } else {
        patch.paymentState = "COLLECTED";
        patch.collectedAt = now;
        patch.collectedByAdminUid = adminUid;
        patch.collectedFils = order.totalFils;
        if (shiftRef) {
          tx.update(shiftRef, {
            saleCount: FieldValue.increment(1),
            totalSalesFils: FieldValue.increment(order.totalFils),
            cashSalesFils: FieldValue.increment(order.paymentMethod === "CASH" ? order.totalFils : 0),
            clickSalesFils: FieldValue.increment(order.paymentMethod === "CLICK" ? order.totalFils : 0),
            updatedAt: now,
          });
        }
      }
    }
    tx.update(orderRef, patch);
    return { id: orderId, status: action, unchanged: false };
  });
}
