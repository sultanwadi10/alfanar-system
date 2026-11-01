import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { getFirebaseAdminFirestore } from "@/lib/firebase/admin";
import {
  ACTIVE_STORE_SHIFTS_COLLECTION,
  getActiveStoreShiftDocumentId,
  SHIFT_STATUSES,
} from "@/lib/shifts/shift-repository";
import type { CreateDeliveryOrderInput } from "@/lib/orders/delivery-order-validation";

type Actor = {
  storeAuthUid: string;
  employeeId: string;
  employeeName: string;
};

export class DeliveryOrderBusinessError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "DeliveryOrderBusinessError";
  }
}

type OrderResult = {
  orderId: string;
  orderNumber: string;
  paymentState: string;
};

function currentJordanDate(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Amman",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value ?? "";

  return `${part("year")}${part("month")}${part("day")}`;
}

export async function createDeliveryOrder(
  input: CreateDeliveryOrderInput,
  actor: Actor,
): Promise<OrderResult> {
  const db = getFirebaseAdminFirestore();
  const day = currentJordanDate();
  const requestKey = `${actor.employeeId}_${input.requestId}`;
  const requestRef = db.collection("deliveryOrderRequests").doc(requestKey);
  const counterRef = db.collection("deliveryOrderCounters").doc(day);
  const shiftIndexRef = db
    .collection(ACTIVE_STORE_SHIFTS_COLLECTION)
    .doc(getActiveStoreShiftDocumentId(actor.storeAuthUid));
  const customerRef = db.collection("customers").doc(input.customerId);
  const productIds = [...new Set(input.items.map((item) => item.productId))];

  return db.runTransaction(async (tx) => {
    // Idempotency: a repeated tap/retry cannot create a second order.
    const previous = await tx.get(requestRef);
    if (previous.exists) {
      const record = previous.data() as OrderResult & { employeeId: string };
      if (record.employeeId !== actor.employeeId) {
        throw new DeliveryOrderBusinessError("FORBIDDEN", "لا يمكنك متابعة هذا الطلب.");
      }
      return {
        orderId: record.orderId,
        orderNumber: record.orderNumber,
        paymentState: record.paymentState,
      };
    }

    const indexDoc = await tx.get(shiftIndexRef);
    const shiftId = indexDoc.data()?.shiftId as string | undefined;
    if (!shiftId) {
      throw new DeliveryOrderBusinessError("NO_SHIFT", "افتح شفت الموظف قبل تسجيل طلبات التوصيل.");
    }
    const shiftDoc = await tx.get(db.collection("shifts").doc(shiftId));
    const shift = shiftDoc.data();
    if (!shift || shift.status !== SHIFT_STATUSES.OPEN || shift.openedByEmployeeId !== actor.employeeId) {
      throw new DeliveryOrderBusinessError("NO_SHIFT", "لا يمكنك تسجيل طلب على شفت موظف آخر أو شفت مغلق.");
    }

    const customerDoc = await tx.get(customerRef);
    const customer = customerDoc.data();
    if (!customer || customer.isArchived === true) {
      throw new DeliveryOrderBusinessError("CUSTOMER_UNAVAILABLE", "العميل غير متاح. ابحث عنه مرة أخرى.");
    }

    const productDocs = await Promise.all(
      productIds.map((id) => tx.get(db.collection("products").doc(id))),
    );
    const productMap = new Map(productDocs.map((snapshot) => [snapshot.id, snapshot.data()]));
    const uniqueLines = new Set<string>();
    let totalFils = 0;
    let couponQuantity = 0;
    const orderItems = input.items.map((item) => {
      const product = productMap.get(item.productId);
      if (!product || product.isDeleted || !product.isActive || !product.showForEmployee) {
        throw new DeliveryOrderBusinessError("PRODUCT_UNAVAILABLE", "أحد المنتجات لم يعد متاحًا. حدّث الصفحة.");
      }
      const requiresOrigin = product.category === "REFILL" && product.requiresBottleOrigin === true;
      if (requiresOrigin !== (item.bottleOrigin !== null)) {
        throw new DeliveryOrderBusinessError("INVALID_ORIGIN", "حدد نوع القارورة للتعبئة المطلوبة.");
      }
      const lineKey = `${item.productId}:${item.bottleOrigin ?? "NONE"}`;
      if (uniqueLines.has(lineKey)) {
        throw new DeliveryOrderBusinessError("INVALID_ITEMS", "توجد أصناف مكررة في الطلب.");
      }
      uniqueLines.add(lineKey);
      const unitPriceFils = product.deliveryPriceFils;
      if (!Number.isSafeInteger(unitPriceFils) || unitPriceFils < 0) {
        throw new DeliveryOrderBusinessError("INVALID_PRICE", "تعذر تحديد سعر أحد المنتجات.");
      }
      const lineTotalFils = unitPriceFils * item.quantity;
      totalFils += lineTotalFils;
      if (product.category === "REFILL") couponQuantity += item.quantity;
      if (input.paymentMethod === "COUPON" && product.category !== "REFILL") {
        throw new DeliveryOrderBusinessError(
          "COUPON_ITEMS",
          "الكوبونات مخصصة لتعبئة قوارير المياه فقط. سجّل المنتجات الأخرى بطلب كاش أو كليك.",
        );
      }
      return {
        productId: item.productId,
        productNameSnapshot: product.name,
        category: product.category,
        quantity: item.quantity,
        bottleOrigin: item.bottleOrigin,
        unitPriceFils,
        lineTotalFils,
      };
    });
    if (!Number.isSafeInteger(totalFils)) {
      throw new DeliveryOrderBusinessError("INVALID_TOTAL", "إجمالي الطلب غير صالح.");
    }

    // Coupons are per numbered, ADMIN-created physical booklet.
    // Never use legacy customer.couponBalance as a reservation ledger.
    // Reserve existing coupons first; a newly requested paper booklet covers
    // only the shortfall AFTER the owner approves its real serial number.
    const allocations: { bookletId: string; quantity: number }[] = [];
    let pendingCouponQuantity = 0;
    let paymentState = input.paymentMethod === "COUPON"
      ? "COUPONS_RESERVED"
      : "DUE_ON_DELIVERY";

    if (input.paymentMethod === "COUPON") {
      const booklets = await tx.get(
        db.collection("couponBooklets").where("customerId", "==", input.customerId),
      );
      let needed = couponQuantity;
      for (const booklet of [...booklets.docs].sort((a, b) => a.id.localeCompare(b.id))) {
        const data = booklet.data();
        if (data.status !== "ACTIVE") continue;
        const remaining = Number.isInteger(data.remainingCoupons) ? data.remainingCoupons : 0;
        const reserved = Number.isInteger(data.reservedCoupons) ? data.reservedCoupons : 0;
        const available = Math.max(0, remaining - reserved);
        const taken = Math.min(available, needed);
        if (taken > 0) {
          allocations.push({ bookletId: booklet.id, quantity: taken });
          needed -= taken;
        }
        if (needed === 0) break;
      }
      if (needed > 0 && (!input.newBookletRequested || needed > 22)) {
        throw new DeliveryOrderBusinessError(
          "COUPONS_INSUFFICIENT",
          "الكوبونات غير كافية لتغطية الطلب. عدّل الكمية أو اطلب دفترًا جديدًا.",
        );
      }
      if (needed > 0) {
        pendingCouponQuantity = needed;
        paymentState = "AWAITING_BOOKLET_APPROVAL";
      }
    }

    const counter = await tx.get(counterRef);
    const next = ((counter.data()?.lastSequence as number | undefined) ?? 0) + 1;
    const orderNumber = String(next).padStart(3, "0");
    const orderId = `${day}-${orderNumber}`;
    const orderRef = db.collection("deliveryOrders").doc(orderId);
    const now = Timestamp.now();

    // All reads above, all writes below.
    for (const allocation of allocations) {
      const bookletRef = db.collection("couponBooklets").doc(allocation.bookletId);
      // The transaction retries if the booklet changes concurrently.
      tx.update(bookletRef, { reservedCoupons: FieldValue.increment(allocation.quantity), updatedAt: now });
    }

    tx.set(counterRef, { lastSequence: next, updatedAt: now }, { merge: true });
    tx.create(orderRef, {
      id: orderId,
      orderDateKey: day,
      orderSequence: next,
      orderNumber,
      status: "NEW",
      customerId: input.customerId,
      customerNameSnapshot: customer.name,
      customerPhoneSnapshot: customer.phoneNormalized,
      deliveryAddress: input.address,
      notes: input.notes,
      items: orderItems,
      itemCount: input.items.reduce((sum, item) => sum + item.quantity, 0),
      totalFils,
      paymentMethod: input.paymentMethod,
      paymentState,
      couponQuantity: input.paymentMethod === "COUPON" ? couponQuantity : 0,
      pendingCouponQuantity,
      couponAllocations: allocations,
      bookletRequest: input.newBookletRequested ? {
        status: "REQUESTED",
        requestedAt: now,
        requestedByEmployeeId: actor.employeeId,
        // No booklet number here. Admin assigns the real number after physical sale.
      } : null,
      storeAuthUid: actor.storeAuthUid,
      shiftId,
      employeeId: actor.employeeId,
      employeeNameSnapshot: actor.employeeName,
      createdAt: now,
      updatedAt: now,
      readyAt: null,
      deliveredAt: null,
      statusHistory: [{ status: "NEW", actorType: "EMPLOYEE", actorId: actor.employeeId, actorName: actor.employeeName, at: now }],
    });
    tx.create(requestRef, { orderId, orderNumber, paymentState, employeeId: actor.employeeId, createdAt: now });
    return { orderId, orderNumber, paymentState };
  });
}
