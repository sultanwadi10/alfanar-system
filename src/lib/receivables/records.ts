import "server-only";
import type { DocumentData, Firestore, Timestamp, Transaction } from "firebase-admin/firestore";
export class ReceivableError extends Error { constructor(public code: string, message: string) { super(message); this.name = "ReceivableError"; } }
export function unsigned(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new ReceivableError("INVALID_BALANCE", "رصيد المستحق غير متسق. راجع الإدارة.");
  return value as number;
}
export function receivableFromOrder(orderId: string, order: DocumentData, now: Timestamp, kind: "MONEY" | "COUPON", quantity: number) {
  const amount = unsigned(quantity);
  return { source:"ORDER" as "ORDER"|"MANUAL", customerId: order.customerId, customerName: String(order.customerNameSnapshot ?? ""), storeAuthUid: order.storeAuthUid,
    orderId, orderNumber: String(order.orderNumber ?? orderId), kind, status: amount ? "OPEN" : "SETTLED",
    original: amount, outstanding: amount, settled: 0, expectedMethod: order.paymentMethod, createdAt: now, updatedAt: now };
}
// Called only inside the same transaction that first delivers the order.
// No separate write and no negative physical booklet balances.
export function openOrderReceivable(tx: Transaction, db: Firestore, orderId: string, order: DocumentData, now: Timestamp, kind: "MONEY" | "COUPON", quantity: number) {
  if (unsigned(quantity) > 0) tx.create(db.collection("customerReceivables").doc(`order_${orderId}`), receivableFromOrder(orderId, order, now, kind, quantity));
}
