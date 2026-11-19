import { preparePrivateBottles } from "@/lib/customers/private-bottles";
import { orderMoneyDue, orderMoneyMethod } from "./payment-plan";
import { openOrderReceivable } from "@/lib/receivables/records";
import { customerSearchDirectory } from "./customer-search-directory";
import { normalizeOrderSearch, orderNameMatches, usefulOrderSearch } from "./order-search";
import { prepareInventoryTransition, bottleRequirements } from "@/lib/inventory/stock-engine";
import type { InventoryPlan, BottleReturn } from "@/types/inventory";
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
  inventoryPlan?: InventoryPlan | null;
  bottleReturns?: BottleReturn[];
  previousBottleReturns?: Array<BottleReturn & { label: string }>;
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
    saleUnitSnapshot?: string;
    personalBottleQuantity?: number;
    bottleSizeMl?: number;
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
  moneyDueFils?: number;
  couponValueFils?: number;
  remainderMethod?: "CASH" | "CLICK";
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
    inventoryTracked: !!order.inventoryPlan,
    returnRequirements: bottleRequirements(order.inventoryPlan),
    bottleReturns: order.bottleReturns ?? [],
    previousBottleReturns: (order.previousBottleReturns ?? []).map(r => ({ itemId: r.itemId, quantity: r.quantity, label: r.label })),
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
      saleUnit: item.saleUnitSnapshot ?? "",
      bottleSizeMl: item.bottleSizeMl,
      category: item.category,
      personalBottleQuantity: item.personalBottleQuantity ?? 0,
      name: item.productNameSnapshot ?? "منتج",
      origin: item.bottleOrigin ?? null,
      quantity: item.quantity ?? 0,
      unitPriceFils: item.unitPriceFils ?? 0,
      lineTotalFils: item.lineTotalFils ?? 0,
    })),
    itemCount: order.itemCount ?? 0,
    totalFils: order.totalFils ?? 0,
    moneyDueFils: orderMoneyDue(order), remainderMethod: orderMoneyMethod(order),
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
  fresh?: boolean;
}) {
  const db = getFirebaseAdminFirestore();
  const orders = db.collection(ORDERS);

  if (input.view === "today" || input.view === "date") {
    const day = input.view === "today" ? jordanDayKey() : input.day!;
    // Single-field query intentionally avoids deployment-time composite indexes.
    const base = orders.where("orderDateKey", "==", day);
    const [snapshot, summary] = await Promise.all([base.limit(DAY_LIMIT + 1).get(), input.view === "date" ? Promise.all([base.count().get(), base.where("status", "==", "DELIVERED").count().get(), base.where("status", "==", "CANCELLED").count().get()]).then(([all, delivered, cancelled]) => ({ all: all.data().count, delivered: delivered.data().count, cancelled: cancelled.data().count })) : Promise.resolve(null)]);
    return {
      summary,
      orders: sortRecent(snapshot.docs.slice(0, DAY_LIMIT).map((doc) => toDto(doc.id, doc.data() as StoredOrder))),
      day,
      limitReached: snapshot.size > DAY_LIMIT,
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

  const raw = (input.query ?? "").trim().replace(/^#\s*/, "");
  if (!usefulOrderSearch(raw)) throw new DeliveryOrderBusinessError("INVALID_QUERY", "اكتب اسم العميل أو رقم الهاتف أو رقم الطلب.");
  const normalized = normalizeOrderSearch(raw).replace(/^#\s*/, ""), phone = normalizeJordanPhone(normalized);
  const explicitNumber = (input.query ?? "").trim().startsWith("#") && /^\d{1,8}$/.test(normalized);
  const found = new Map<string, AdminOrder>();
  let partial = false;
  const add = (snapshot: FirebaseFirestore.QuerySnapshot) => {
    if (snapshot.size > SEARCH_LIMIT) partial = true;
    for (const doc of snapshot.docs.slice(0, SEARCH_LIMIT)) found.set(doc.id, toDto(doc.id, doc.data() as StoredOrder));
  };
  if (/^\d{8}-\d{3,8}$/.test(normalized)) {
    const doc = await orders.doc(normalized).get();
    if (doc.exists) found.set(doc.id, toDto(doc.id, doc.data() as StoredOrder));
  } else if (/^\d{1,8}$/.test(normalized) && (normalized.length < 4 || explicitNumber)) {
    const variants = [...new Set([normalized, String(Number(normalized)), String(Number(normalized)).padStart(3, "0")])];
    add(await orders.where("orderNumber", "in", variants).limit(SEARCH_LIMIT + 1).get());
  } else if (phone) {
    add(await orders.where("customerPhoneSnapshot", "==", phone).limit(SEARCH_LIMIT + 1).get());
  } else {
    const directory = await customerSearchDirectory(input.fresh);
    const digits = normalized.replace(/\D/g, ""), isPhonePart = /^[+\d ()-]+$/.test(normalized) && digits.length >= 4;
    const phoneDigits = digits.startsWith("00962") ? digits.slice(2) : digits.startsWith("07") ? digits.slice(1) : digits;
    const matching = directory.rows.filter(customer => isPhonePart ? customer.phone.replace(/\D/g, "").includes(phoneDigits) : orderNameMatches(customer.name, normalized));
    partial = directory.partial || matching.length > 30;
    const ids = matching.slice(0, 30).map(customer => customer.id);
    const batches: Promise<FirebaseFirestore.QuerySnapshot>[] = [];
    for (let offset = 0; offset < ids.length; offset += 10) batches.push(orders.where("customerId", "in", ids.slice(offset, offset + 10)).limit(SEARCH_LIMIT + 1).get());
    (await Promise.all(batches)).forEach(add);
    // Retain lookup of historical snapshots if a customer was renamed/deleted.
    if (!matching.length && !isPhonePart) {
      const words = raw.replace(/\s+/g, " ").trim();
      const variants = [...new Set([words, words.toLowerCase(), words.toUpperCase(), words.toLowerCase().replace(/(^|\s)\p{L}/gu, value => value.toUpperCase())])].slice(0, 4);
      const snapshots = await Promise.all(variants.map(prefix => orders.orderBy("customerNameSnapshot").startAt(prefix).endAt(prefix + "\uf8ff").limit(SEARCH_LIMIT + 1).get()));
      snapshots.forEach(add);
    }
    // Four or more digits can also be a daily order number.
    if (/^\d{4,8}$/.test(normalized)) add(await orders.where("orderNumber", "in", [...new Set([normalized, String(Number(normalized)), String(Number(normalized)).padStart(3, "0")])]).limit(SEARCH_LIMIT + 1).get());
  }
  const sorted = sortRecent([...found.values()]);
  return { orders: sorted.slice(0, SEARCH_LIMIT), day: null as string | null, summary: null, limitReached: partial || sorted.length > SEARCH_LIMIT, hasMore: false, nextCursor: null as string | null };

}

export async function changeAdminDeliveryOrderStatus(
  orderId: string,
  action: "DELIVERED" | "CANCELLED",
  adminUid: string,
  input: { paymentDeferred?: boolean; paymentCollected: boolean; reason: string; bottleReturns?: BottleReturn[] },
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

    if (action === "DELIVERED" && input.paymentCollected && input.paymentDeferred) throw new DeliveryOrderBusinessError("INVALID_PAYMENT", "اختر حالة تحصيل واحدة.");
    if (action === "DELIVERED" && (!Number.isSafeInteger(order.totalFils) || order.totalFils < 0)) throw new DeliveryOrderBusinessError("INVALID_AMOUNT", "قيمة الطلب غير صالحة.");
    if (input.paymentDeferred && (action !== "DELIVERED" || orderMoneyDue(order) === 0)) throw new DeliveryOrderBusinessError("INVALID_PAYMENT", "تأجيل المبلغ متاح عند تسليم طلب كاش أو تحويل فقط.");
    const allocations = order.couponAllocations ?? [];
    const neededBooklets = action === "CANCELLED" || (action === "DELIVERED" && order.paymentMethod === "COUPON");
    const bookletDocs = neededBooklets
      ? await Promise.all(allocations.map((a) => tx.get(db.collection("couponBooklets").doc(a.bookletId))))
      : [];

    let shiftRef: FirebaseFirestore.DocumentReference | null = null;
    if (action === "DELIVERED") {
      if(orderMoneyDue(order)>0&&!input.paymentCollected&&!input.paymentDeferred)throw new DeliveryOrderBusinessError("PAYMENT_REQUIRED","أكد استلام المبلغ أو إبقاءه على العميل.");
      const indexDoc=await tx.get(db.collection(ACTIVE_STORE_SHIFTS_COLLECTION).doc(getActiveStoreShiftDocumentId(order.storeAuthUid)));
      const currentShiftId=indexDoc.data()?.shiftId;
      if(typeof currentShiftId!=="string")throw new DeliveryOrderBusinessError("NO_SHIFT","يلزم شفت مفتوح لتسجيل التسليم.");
      shiftRef=db.collection("shifts").doc(currentShiftId);
      const currentShift=await tx.get(shiftRef);
      if(currentShift.data()?.status!=="OPEN"||currentShift.data()?.storeAuthUid!==order.storeAuthUid)throw new DeliveryOrderBusinessError("NO_SHIFT","الشفت الحالي غير صالح.");
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

    const privateBottles=await preparePrivateBottles(tx,db,order.customerId,order.items??[],action,orderId,adminUid);
    const inventory = await prepareInventoryTransition(tx, db, order.inventoryPlan, order.status, action, input.bottleReturns, { operationId: `order:${orderId}:${action}`, actor: { id: adminUid, name: "الإدارة", type: "ADMIN" }, customerId: order.customerId, customerName: order.customerNameSnapshot, orderId });
    inventory.commit();
    privateBottles.commit();
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
      patch.bottleReturns = input.bottleReturns ?? [];
      patch.previousBottleReturns = inventory.previousReturns;
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
        if ((order.pendingCouponQuantity ?? 0) > 0) openOrderReceivable(tx, db, orderId, order, now, "COUPON", order.pendingCouponQuantity!);
        patch.paymentState = (order.pendingCouponQuantity ?? 0) > 0
          ? "AWAITING_BOOKLET_APPROVAL" : "COUPONS_SETTLED";
      }
      patch.deliveredShiftId = shiftRef?.id ?? null;
      if (shiftRef) tx.update(shiftRef,{saleCount:FieldValue.increment(1),totalSalesFils:FieldValue.increment(order.totalFils),cashSalesFils:FieldValue.increment(!input.paymentDeferred&&orderMoneyMethod(order)==="CASH"?orderMoneyDue(order):0),clickSalesFils:FieldValue.increment(!input.paymentDeferred&&orderMoneyMethod(order)==="CLICK"?orderMoneyDue(order):0),updatedAt:now});
      if (input.paymentDeferred && orderMoneyDue(order) > 0) {
        patch.paymentState = "PAYMENT_DUE"; patch.collectedFils = 0; patch.collectionMode = "RECEIPTS";
        openOrderReceivable(tx, db, orderId, { ...order, totalFils: orderMoneyDue(order) }, now, "MONEY", orderMoneyDue(order));
      } else if (orderMoneyDue(order) > 0) {
        patch.paymentState = "COLLECTED";
        patch.collectedAt = now;
        patch.collectedByAdminUid = adminUid;
        patch.collectedFils = orderMoneyDue(order);

      }
    }
    tx.update(orderRef, patch);
    return { id: orderId, status: action, unchanged: false };
  });
}
