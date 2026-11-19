import { preparePrivateBottles } from "@/lib/customers/private-bottles";
import { deliveryPaymentPlan } from "./payment-plan";
import { customerDeliveryUnitPrice,refillBottleSize } from "@/lib/customers/delivery-pricing";
import { InventoryError, keyFor, prepareNewInventory } from "@/lib/inventory/stock-engine";
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
  actorType?: "ADMIN" | "EMPLOYEE";
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
  pendingCouponQuantity?: number;
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
  const requestKey = `${actor.actorType === "ADMIN" ? "admin:" : ""}${actor.employeeId}_${input.requestId}`;
  const requestRef = db.collection("deliveryOrderRequests").doc(requestKey);
  const counterRef = db.collection("deliveryOrderCounters").doc(day);
  const shiftIndexRef = db
    .collection(ACTIVE_STORE_SHIFTS_COLLECTION)
    .doc(getActiveStoreShiftDocumentId(actor.storeAuthUid));
  const customerRef = db.collection("customers").doc(input.customerId);
  const productIds = [...new Set(input.items.map((item) => item.productId))];
  const fingerprint = keyFor(JSON.stringify({ ...input, requestId: "", items: [...input.items].sort((a, b) => `${a.productId}:${a.bottleOrigin}`.localeCompare(`${b.productId}:${b.bottleOrigin}`)) }));

  return db.runTransaction(async (tx) => {
    // Idempotency: a repeated tap/retry cannot create a second order.
    const previous = await tx.get(requestRef);
    if (previous.exists) {
      const record = previous.data() as OrderResult & { employeeId: string; requestFingerprint?: string; storeAuthUid?: string };
      if (record.employeeId !== actor.employeeId) {
        throw new DeliveryOrderBusinessError("FORBIDDEN", "لا يمكنك متابعة هذا الطلب.");
      }
      if ((record.storeAuthUid && record.storeAuthUid !== actor.storeAuthUid) || (record.requestFingerprint && record.requestFingerprint !== fingerprint)) throw new InventoryError("REQUEST_REUSED", "رقم الطلب مستخدم لبيانات مختلفة. أعد فتح نموذج الطلب.");
      return {
        orderId: record.orderId,
        orderNumber: record.orderNumber,
        paymentState: record.paymentState, pendingCouponQuantity: record.pendingCouponQuantity ?? 0,
      };
    }

    let shiftId: string | null = null;
    if(actor.actorType!=="ADMIN"){
      const indexDoc = await tx.get(shiftIndexRef);
      shiftId = indexDoc.data()?.shiftId as string | undefined ?? null;
      if (!shiftId) {
        throw new DeliveryOrderBusinessError("NO_SHIFT", "افتح شفت الموظف قبل تسجيل طلبات التوصيل.");
      }
      const shiftDoc = await tx.get(db.collection("shifts").doc(shiftId));
      const shift = shiftDoc.data();
      if (!shift || shift.status !== SHIFT_STATUSES.OPEN || shift.openedByEmployeeId !== actor.employeeId) {
        throw new DeliveryOrderBusinessError("NO_SHIFT", "لا يمكنك تسجيل طلب على شفت موظف آخر أو شفت مغلق.");
      }

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
    const policyDocs=await Promise.all(productDocs.map(doc=>tx.get(db.collection("inventoryPolicies").doc(doc.id))));
    const policyMap=new Map(policyDocs.map(doc=>[doc.id,doc.data()]));
    const pricingPolicies=new Map(policyDocs.map(doc=>[doc.id,doc.data()?.bottleSizeMl]));
    const stockIds=[...new Set(policyDocs.map(doc=>doc.data()?.itemId).filter((id):id is string=>typeof id==="string"&&id.length>0))];
    const stockDocs=await Promise.all(stockIds.map(id=>tx.get(db.collection("inventoryItems").doc(id))));
    const stockMap=new Map(stockDocs.map(doc=>[doc.id,doc.data()]));
    const uniqueLines = new Set<string>();
    let totalFils = 0;
    let couponQuantity = 0;
    const orderItems = input.items.map((item) => {
      const product = productMap.get(item.productId);
      if (!product || product.isDeleted || !product.isActive || !product.showForEmployee) {
        throw new DeliveryOrderBusinessError("PRODUCT_UNAVAILABLE", "أحد المنتجات لم يعد متاحًا. حدّث الصفحة.");
      }
      if (product.deliveryEnabled === false) throw new DeliveryOrderBusinessError("STORE_ONLY", "هذا الصنف متاح داخل المحل فقط ولا يدخل ضمن طلبات التوصيل.");
      const requiresOrigin = product.category === "REFILL" && product.requiresBottleOrigin === true;
      if (requiresOrigin !== (item.bottleOrigin !== null)) {
        throw new DeliveryOrderBusinessError("INVALID_ORIGIN", "حدد نوع القارورة للتعبئة المطلوبة.");
      }
      const lineKey = `${item.productId}:${item.bottleOrigin ?? "NONE"}`;
      if (uniqueLines.has(lineKey)) {
        throw new DeliveryOrderBusinessError("INVALID_ITEMS", "توجد أصناف مكررة في الطلب.");
      }
      uniqueLines.add(lineKey);
      const pricing=customerDeliveryUnitPrice(product as {category?:string;name?:string;bottleSizeMl?:unknown;deliveryPriceFils:number},customer,pricingPolicies.get(item.productId));
      const unitPriceFils = pricing.unitPriceFils;
      if (!Number.isSafeInteger(unitPriceFils) || unitPriceFils < 0) {
        throw new DeliveryOrderBusinessError("INVALID_PRICE", "تعذر تحديد سعر أحد المنتجات.");
      }
      const lineTotalFils = unitPriceFils * item.quantity;
      totalFils += lineTotalFils;
      if (product.category === "REFILL") couponQuantity += item.quantity;
      const policy=policyMap.get(item.productId),stock=policy?.itemId?stockMap.get(policy.itemId):undefined;
      const saleUnit=stock?(policy?.unitsPerSale===stock.unitsPerPack?stock.packLabel:policy?.unitsPerSale===1?stock.baseUnit:""):"";
      return {
        saleUnitSnapshot:typeof saleUnit==="string"?saleUnit:"",
        productId: item.productId,
        productNameSnapshot: product.name,
        category: product.category,
        bottleSizeMl: refillBottleSize(product,pricingPolicies.get(item.productId)),
        quantity: item.quantity,
        bottleOrigin: item.bottleOrigin,
        personalBottleQuantity: item.personalBottleQuantity,
        storeBottleShortageConfirmed: item.storeBottleShortageConfirmed,
        ...(item.expectedPrivateBottleQuantity!==undefined?{expectedPrivateBottleQuantity:item.expectedPrivateBottleQuantity}:{}),
        unitPriceFils,
        standardUnitPriceFils: product.deliveryPriceFils,
        pricingSource: pricing.source,
        lineTotalFils,
      };
    });
    if (!Number.isSafeInteger(totalFils)) {
      throw new DeliveryOrderBusinessError("INVALID_TOTAL", "إجمالي الطلب غير صالح.");
    }

    if(input.expectedTotalFils!==undefined&&input.expectedTotalFils!==totalFils)throw new DeliveryOrderBusinessError("PRICE_CHANGED","تغيّر سعر الطلب. أعد اختيار العميل وحدّث الصفحة لمراجعة السعر قبل الحفظ.");

    // Coupons are per numbered, ADMIN-created physical booklet.
    // Never use legacy customer.couponBalance as a reservation ledger.
    // Reserve available coupons; a shortage never blocks placing the order.
    // Delivery turns the uncovered quantity into a receivable. A physical
    // booklet is still issued only after an explicit administrative approval.
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
      for (const booklet of [...booklets.docs].sort((a, b) => {
        const at=(v: FirebaseFirestore.DocumentData)=>{const date=v.activatedAt??v.createdAt;return date instanceof Timestamp?date.toMillis():0;};
        return at(a.data())-at(b.data())||a.id.localeCompare(b.id);
      })) {
        const data = booklet.data();
        if (data.status !== "ACTIVE") continue;
        if (!Number.isSafeInteger(data.remainingCoupons) || data.remainingCoupons<0 || data.remainingCoupons>22 || !Number.isSafeInteger(data.reservedCoupons) || data.reservedCoupons<0 || data.reservedCoupons>data.remainingCoupons) throw new DeliveryOrderBusinessError("INVALID_COUPON_BALANCE","رصيد أحد دفاتر العميل غير متسق؛ راجع الإدارة.");
        const remaining = data.remainingCoupons;
        const reserved = data.reservedCoupons;
        const available = Math.max(0, remaining - reserved);
        const taken = Math.min(available, needed);
        if (taken > 0) {
          allocations.push({ bookletId: booklet.id, quantity: taken });
          needed -= taken;
        }
        if (needed === 0) break;
      }
      if (needed > 0) {
        pendingCouponQuantity = 0;
      }
    }

    const payment = deliveryPaymentPlan(orderItems, allocations.reduce((sum, row) => sum + row.quantity, 0), input.paymentMethod === "COUPON");
    if (input.expectedCouponQuantity !== undefined && input.expectedCouponQuantity !== payment.couponQuantity) throw new DeliveryOrderBusinessError("COUPON_BALANCE_CHANGED", "تغير رصيد الكوبونات. حدّث رصيد العميل وراجع المبلغ المتبقي قبل التأكيد.");
    couponQuantity = payment.couponQuantity;
    paymentState = payment.moneyDueFils > 0 ? "DUE_ON_DELIVERY" : "COUPONS_RESERVED";
    orderItems.forEach((item, index) => Object.assign(item, payment.items[index]));
    const counter = await tx.get(counterRef);
    const next = ((counter.data()?.lastSequence as number | undefined) ?? 0) + 1;
    const orderNumber = String(next).padStart(3, "0");
    const orderId = `${day}-${orderNumber}`;
    const orderRef = db.collection("deliveryOrders").doc(orderId);
    const now = Timestamp.now();

    const privateBottles=await preparePrivateBottles(tx,db,input.customerId,orderItems,"RESERVE",orderId,actor.employeeId);
    const inventory = await prepareNewInventory(tx, db, orderItems, true, { operationId: `order:${orderId}:reserve`, actor: { id: actor.employeeId, name: actor.employeeName, type: actor.actorType ?? "EMPLOYEE" }, customerId: input.customerId, customerName: customer.name, orderId });
    // All reads above, all writes below.
    inventory.commit();
    privateBottles.commit();
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
      inventoryPlan: inventory.plan,
      customerId: input.customerId,
      customerNameSnapshot: customer.name,
      customerPhoneSnapshot: customer.phoneNormalized,
      deliveryAddress: input.address,
      notes: input.notes,
      items: orderItems,
      itemCount: input.items.reduce((sum, item) => sum + item.quantity, 0),
      totalFils,
      paymentVersion: 2,
      moneyDueFils: payment.moneyDueFils,
      couponValueFils: payment.couponValueFils,
      remainderMethod: input.remainderMethod,
      paymentMethod: input.paymentMethod,
      paymentState,
      couponQuantity: input.paymentMethod === "COUPON" ? couponQuantity : 0,
      pendingCouponQuantity,
      couponAllocations: allocations,
      bookletRequest: input.newBookletRequested ? {
        status: "REQUESTED",
        requestedAt: now,
        requestedByEmployeeId: actor.actorType === "ADMIN" ? null : actor.employeeId,
        requestedByAdminId: actor.actorType === "ADMIN" ? actor.employeeId : null,
        // No booklet number here. Admin assigns the real number after physical sale.
      } : null,
      storeAuthUid: actor.storeAuthUid,
      shiftId,
      createdByAdminId: actor.actorType === "ADMIN" ? actor.employeeId : null,
      createdByType: actor.actorType ?? "EMPLOYEE",
      employeeId: actor.actorType === "ADMIN" ? null : actor.employeeId,
      employeeNameSnapshot: actor.employeeName,
      createdAt: now,
      updatedAt: now,
      readyAt: null,
      deliveredAt: null,
      statusHistory: [{ status: "NEW", actorType: actor.actorType ?? "EMPLOYEE", actorId: actor.employeeId, actorName: actor.employeeName, at: now }],
    });
    tx.create(requestRef, { orderId, orderNumber, paymentState, employeeId: actor.employeeId, storeAuthUid: actor.storeAuthUid, requestFingerprint: fingerprint, pendingCouponQuantity, createdAt: now });
    return { orderId, orderNumber, paymentState, pendingCouponQuantity };
  });
}
