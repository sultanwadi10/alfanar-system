import { preparePrivateBottles } from "@/lib/customers/private-bottles";
import { orderMoneyDue, orderMoneyMethod } from "./payment-plan";
import { openOrderReceivable } from "@/lib/receivables/records";
import { prepareInventoryTransition, bottleRequirements } from "@/lib/inventory/stock-engine";
import type { InventoryPlan, BottleReturn } from "@/types/inventory";
import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { getFirebaseAdminFirestore } from "@/lib/firebase/admin";
import {
  ACTIVE_STORE_SHIFTS_COLLECTION,
  getActiveStoreShiftDocumentId,
  SHIFT_STATUSES,
} from "@/lib/shifts/shift-repository";
import { DeliveryOrderBusinessError } from "@/lib/orders/delivery-order-repository";

export type OperatorOrderAction = "READY" | "DELIVERED" | "CANCELLED";

type Actor = {
  storeAuthUid: string;
  employeeId: string;
  employeeName: string;
};

type CouponAllocation = { bookletId: string; quantity: number };

type OrderRecord = {
  inventoryPlan?: InventoryPlan | null;
  bottleReturns?: BottleReturn[];
  previousBottleReturns?: Array<BottleReturn & { label: string }>;
  storeAuthUid: string;
  orderDateKey: string;
  orderNumber: string;
  status: string;
  customerId: string;
  customerNameSnapshot: string;
  customerPhoneSnapshot: string;
  deliveryAddress: string;
  notes: string;
  items: Array<{
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
  itemCount: number;
  totalFils: number;
  paymentMethod: "CASH" | "CLICK" | "COUPON";
  moneyDueFils?: number;
  couponValueFils?: number;
  remainderMethod?: "CASH" | "CLICK";
  paymentState: string;
  collectedFils?: number;
  couponAllocations?: CouponAllocation[];
  pendingCouponQuantity?: number;
  bookletRequest?: { status: string } | null;
  createdAt: Timestamp;
  readyAt?: Timestamp | null;
  deliveredAt?: Timestamp | null;
  updatedAt?: Timestamp;
};

export function jordanDayKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Amman",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${read("year")}${read("month")}${read("day")}`;
}

// Deliberate whitelist: never serialize Firestore document or internal coupon
// allocations, serials, wallet balances, admin notes or statusHistory to staff.
function toOperatorOrder(id: string, order: OrderRecord) {
  return {
    id,
    inventoryTracked: !!order.inventoryPlan,
    returnRequirements: bottleRequirements(order.inventoryPlan),
    bottleReturns: order.bottleReturns ?? [],
    previousBottleReturns: (order.previousBottleReturns ?? []).map(r => ({ itemId: r.itemId, label: r.label, quantity: r.quantity })),
    source: (order as OrderRecord & {createdByType?:string}).createdByType === "ADMIN" ? "ADMIN" : "EMPLOYEE",
    number: order.orderNumber,
    status: order.status,
    customer: {
      name: order.customerNameSnapshot ?? "",
      phone: order.customerPhoneSnapshot ?? "",
      address: order.deliveryAddress ?? "",
    },
    notes: order.notes ?? "",
    items: (order.items ?? []).map((item) => ({
      saleUnit: item.saleUnitSnapshot ?? "",
      bottleSizeMl: item.bottleSizeMl,
      category: item.category,
      personalBottleQuantity: item.personalBottleQuantity ?? 0,
      name: item.productNameSnapshot,
      quantity: item.quantity,
      bottleOrigin: item.bottleOrigin ?? null,
      unitPriceFils: item.unitPriceFils,
      lineTotalFils: item.lineTotalFils,
    })),
    itemCount: order.itemCount ?? 0,
    totalFils: order.totalFils ?? 0,
    moneyDueFils: orderMoneyDue(order), remainderMethod: orderMoneyMethod(order),
    paymentMethod: order.paymentMethod,
    paymentState: order.paymentState, collectedFils: order.collectedFils ?? 0, pendingCouponQuantity: order.pendingCouponQuantity ?? 0,
    // Status of the handover request, NOT any private booklet record.
    bookletRequestStatus: order.bookletRequest?.status ?? null,
    createdAt: order.createdAt.toDate().toISOString(),
    readyAt: order.readyAt?.toDate().toISOString() ?? null,
    deliveredAt: order.deliveredAt?.toDate().toISOString() ?? null,
  };
}

export async function listEmployeeTodayOrders(storeAuthUid: string) {
  const day = jordanDayKey();
  const snapshot = await getFirebaseAdminFirestore()
    .collection("deliveryOrders")
    .where("orderDateKey", "==", day)
    .limit(500)
    .get();
  const pending = await getFirebaseAdminFirestore().collection("deliveryOrders").where("status","in",["NEW","READY"]).limit(500).get();
  const orders = [...new Map([...snapshot.docs,...pending.docs].map(doc=>[doc.id,doc])).values()]
    .filter((doc) => doc.data().storeAuthUid === storeAuthUid)
    .map((doc) => toOperatorOrder(doc.id, doc.data() as OrderRecord))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { day, orders, limitReached: snapshot.size === 500 || pending.size === 500 };
}

export async function changeEmployeeOrderStatus(
  orderId: string,
  action: OperatorOrderAction,
  actor: Actor,
  paymentCollected: boolean,
  bottleReturns?: BottleReturn[],
  previousBottleReturns: BottleReturn[] = [],
  paymentDeferred = false,
) {
  const db = getFirebaseAdminFirestore();
  const orderRef = db.collection("deliveryOrders").doc(orderId);
  const activeShiftRef = db.collection(ACTIVE_STORE_SHIFTS_COLLECTION)
    .doc(getActiveStoreShiftDocumentId(actor.storeAuthUid));

  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(orderRef);
    if (!snapshot.exists) {
      throw new DeliveryOrderBusinessError("NOT_FOUND", "الطلب غير موجود.");
    }
    const order = snapshot.data() as OrderRecord;
    if (order.storeAuthUid !== actor.storeAuthUid) {
      throw new DeliveryOrderBusinessError("NOT_FOUND", "الطلب غير موجود.");
    }
    if (order.status === action) {
      return { id: orderId, status: order.status, unchanged: true };
    }
    if (
      (action === "READY" && order.status !== "NEW") ||
      (action === "DELIVERED" && order.status !== "READY") ||
      (action === "CANCELLED" && !["NEW", "READY"].includes(order.status))
    ) {
      throw new DeliveryOrderBusinessError(
        "INVALID_TRANSITION", "حالة الطلب تغيّرت. حدّث القائمة وحاول مرة أخرى.",
      );
    }

    if (action === "DELIVERED" && (!Number.isSafeInteger(order.totalFils) || order.totalFils < 0 || !["CASH","CLICK","COUPON"].includes(order.paymentMethod))) throw new DeliveryOrderBusinessError("INVALID_AMOUNT", "قيمة الطلب أو طريقة دفعه غير صالحة.");
    if (paymentDeferred && (action !== "DELIVERED" || orderMoneyDue(order) === 0)) throw new DeliveryOrderBusinessError("INVALID_PAYMENT", "تأجيل المبلغ متاح عند تسليم طلب كاش أو تحويل فقط.");
    const allocations = order.couponAllocations ?? [];
    const bookletReads = await Promise.all(
      (action === "CANCELLED" || (action === "DELIVERED" && order.paymentMethod === "COUPON"))
        ? allocations.map((entry) => tx.get(db.collection("couponBooklets").doc(entry.bookletId)))
        : [],
    );

    let shiftRef: FirebaseFirestore.DocumentReference | null = null;
    let shift: FirebaseFirestore.DocumentData | undefined;
    if (action === "DELIVERED") {
      if (orderMoneyDue(order) > 0 && ((paymentCollected !== true && !paymentDeferred) || (paymentCollected && paymentDeferred))) {
        throw new DeliveryOrderBusinessError(
          "PAYMENT_NOT_CONFIRMED", "أكد استلام المبلغ أو اختر «باقي على العميل» قبل التسليم.",
        );
      }
      const shiftIndex = await tx.get(activeShiftRef);
      const shiftId = shiftIndex.data()?.shiftId as string | undefined;
      if (!shiftId) {
        throw new DeliveryOrderBusinessError("NO_SHIFT", "يلزم شفت مفتوح لتحصيل مبلغ التوصيل.");
      }
      shiftRef = db.collection("shifts").doc(shiftId);
      const shiftSnapshot = await tx.get(shiftRef);
      shift = shiftSnapshot.data();
      if (!shift || shift.storeAuthUid !== actor.storeAuthUid || shift.status !== SHIFT_STATUSES.OPEN ||
          shift.openedByEmployeeId !== actor.employeeId) {
        throw new DeliveryOrderBusinessError(
          "NO_SHIFT", "لا يمكنك التحصيل بدون شفت مفتوح باسمك.",
        );
      }
    }

    if (action === "CANCELLED" || (action === "DELIVERED" && order.paymentMethod === "COUPON")) {
      for (let i = 0; i < bookletReads.length; i++) {
        const allocation = allocations[i];
        const booklet = bookletReads[i];
        if (!booklet.exists || !allocation ||
            !Number.isInteger(allocation.quantity) || allocation.quantity < 1) {
          throw new DeliveryOrderBusinessError("COUPON_INCONSISTENT", "تعذر تسوية الكوبونات. راجع الإدارة.");
        }
        const record = booklet.data()!;
        if (record.customerId !== order.customerId ||
            (record.reservedCoupons ?? 0) < allocation.quantity ||
            (action === "DELIVERED" && (record.remainingCoupons ?? 0) < allocation.quantity)) {
          throw new DeliveryOrderBusinessError("COUPON_INCONSISTENT", "تعذر تسوية الكوبونات. راجع الإدارة.");
        }
      }
    }

    // Orders not yet prepared can adopt the new reservation timing safely.
    const inventoryPlan:InventoryPlan|null|undefined=action==="READY"&&order.inventoryPlan?{...order.inventoryPlan,merchandiseDeductionStage:"DELIVERED"}:order.inventoryPlan;
    const privateBottles=action === "READY" ? {commit(){}} : await preparePrivateBottles(tx,db,order.customerId,order.items??[],action,orderId,actor.employeeId);
    const inventory = await prepareInventoryTransition(tx, db, inventoryPlan, order.status, action, bottleReturns, { operationId: `order:${orderId}:${action}`, actor: { id: actor.employeeId, name: actor.employeeName, type: "EMPLOYEE" }, customerId: order.customerId, customerName: order.customerNameSnapshot, orderId }, previousBottleReturns);
    inventory.commit();
    privateBottles.commit();
    // No more reads beyond this point: all changes commit atomically.
    const now = Timestamp.now();
    const update: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData> = {
      status: action,
      updatedAt: now,
      statusHistory: FieldValue.arrayUnion({
        status: action, actorType: "EMPLOYEE",
        actorId: actor.employeeId, actorName: actor.employeeName, at: now,
      }),
    };

    if (action === "READY") {
      if(inventoryPlan)update.inventoryPlan=inventoryPlan;
      update.readyAt = now;
      update.readyByEmployeeId = actor.employeeId;
      update.readyByEmployeeName = actor.employeeName;
    }

    if (action === "CANCELLED") {
      update.cancelledAt = now;
      update.cancelledByEmployeeId = actor.employeeId;
      update.cancelReason = "ألغاه الموظف من طلبات اليوم";
      if (order.bookletRequest?.status === "REQUESTED") {
        update["bookletRequest.status"] = "CANCELLED";
        update["bookletRequest.cancelledAt"] = now;
      }
      for (const allocation of allocations) {
        tx.update(db.collection("couponBooklets").doc(allocation.bookletId), {
          reservedCoupons: FieldValue.increment(-allocation.quantity), updatedAt: now,
        });
      }
      if (order.paymentMethod === "COUPON") update.paymentState = "CANCELLED";
    }

    if (action === "DELIVERED") {
      update.deliveredAt = now;
      update.bottleReturns = bottleReturns ?? [];
      update.previousBottleReturns = inventory.previousReturns;
      update.deliveredByEmployeeId = actor.employeeId;
      update.deliveredByEmployeeName = actor.employeeName;

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
            orderId, type: "ORDER_DEBIT", quantity: allocation.quantity,
            employeeId: actor.employeeId, createdAt: now,
          });
        }
        if ((order.pendingCouponQuantity ?? 0) > 0) openOrderReceivable(tx, db, orderId, order, now, "COUPON", order.pendingCouponQuantity!);
        // A new booklet requested by the customer cannot be activated or
        // charged here. The deferred quantity must be reconciled by admin.
        update.paymentState = (order.pendingCouponQuantity ?? 0) > 0
          ? "AWAITING_BOOKLET_APPROVAL"
          : "COUPONS_SETTLED";
      }
      update.deliveredShiftId = shiftRef?.id ?? null;
      if (shiftRef) tx.update(shiftRef,{saleCount:FieldValue.increment(1),totalSalesFils:FieldValue.increment(!paymentDeferred?orderMoneyDue(order):0),cashSalesFils:FieldValue.increment(!paymentDeferred&&orderMoneyMethod(order)==="CASH"?orderMoneyDue(order):0),clickSalesFils:FieldValue.increment(!paymentDeferred&&orderMoneyMethod(order)==="CLICK"?orderMoneyDue(order):0),updatedAt:now});
      if (paymentDeferred && orderMoneyDue(order) > 0) {
        update.paymentState = "PAYMENT_DUE"; update.collectedFils = 0; update.collectionMode = "RECEIPTS";
        openOrderReceivable(tx, db, orderId, { ...order, totalFils: orderMoneyDue(order) }, now, "MONEY", orderMoneyDue(order));
      } else if (orderMoneyDue(order) > 0) {
        update.paymentState = "COLLECTED";
        update.collectedAt = now;
        update.collectedByEmployeeId = actor.employeeId;
        update.collectedFils = orderMoneyDue(order);

      }
    }

    tx.update(orderRef, update);
    return { id: orderId, status: action, unchanged: false };
  });
}
