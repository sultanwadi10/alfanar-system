import "server-only";
import { Timestamp } from "firebase-admin/firestore";
import { getFirebaseAdminFirestore } from "@/lib/firebase/admin";
import { ACTIVE_STORE_SHIFTS_COLLECTION, getActiveStoreShiftDocumentId, SHIFT_STATUSES } from "@/lib/shifts/shift-repository";
import { InventoryError, integer, keyFor, prepareNewInventory } from "@/lib/inventory/stock-engine";

export class NoActiveShiftError extends Error { constructor(message = "لا يوجد شفت مفتوح باسم الموظف الحالي.") { super(message); this.name = "NoActiveShiftError"; } }
export class ProductUnavailableError extends Error { constructor(name?: string) { super(name ? `المنتج «${name}» غير متاح للبيع حاليًا.` : "أحد المنتجات غير متاح للبيع."); this.name = "ProductUnavailableError"; } }
export type DirectSaleResult = { saleId: string; totalFils: number; paymentMethod: "CASH" | "CLICK"; createdAt: Date };
export async function createDirectSale(input: { requestId: string; storeAuthUid: string; employeeId: string; employeeName: string; paymentMethod: "CASH" | "CLICK"; items: Array<{ productId: string; quantity: number }> }): Promise<DirectSaleResult> {
  const db = getFirebaseAdminFirestore();
  const merged = new Map<string, number>();
  for (const item of input.items) merged.set(item.productId, integer((merged.get(item.productId) ?? 0) + item.quantity, "كمية البيع", 1));
  const items = [...merged].map(([productId, quantity]) => ({ productId, quantity }));
  const saleRef = db.collection("directSales").doc(keyFor(`${input.storeAuthUid}:${input.employeeId}:${input.requestId}`));
  const fingerprint = keyFor(JSON.stringify({ method: input.paymentMethod, items: [...items].sort((a, b) => a.productId.localeCompare(b.productId)) }));
  const indexRef = db.collection(ACTIVE_STORE_SHIFTS_COLLECTION).doc(getActiveStoreShiftDocumentId(input.storeAuthUid));
  return db.runTransaction(async tx => {
    const previous = await tx.get(saleRef);
    if (previous.exists) {
      const saved = previous.data()!;
      if (saved.requestFingerprint !== fingerprint) throw new InventoryError("REQUEST_REUSED", "رقم العملية مستخدم لبيانات بيع مختلفة.");
      return { saleId: previous.id, totalFils: saved.totalFils, paymentMethod: saved.paymentMethod, createdAt: saved.createdAt.toDate() };
    }
    const index = (await tx.get(indexRef)).data();
    if (!index?.shiftId) throw new NoActiveShiftError();
    const shiftRef = db.collection("shifts").doc(index.shiftId);
    const shift = (await tx.get(shiftRef)).data();
    if (!shift || shift.status !== SHIFT_STATUSES.OPEN || shift.openedByEmployeeId !== input.employeeId) throw new NoActiveShiftError();
    const docs = await Promise.all(items.map(item => tx.get(db.collection("products").doc(item.productId))));
    let totalFils = 0;
    const saleItems = docs.map((doc, i) => {
      const product = doc.data();
      if (!product || product.isDeleted || !product.isActive || !product.showForEmployee) throw new ProductUnavailableError(product?.name);
      const price = integer(product.storePriceFils, "سعر المنتج");
      const lineTotalFils = integer(price * items[i].quantity, "قيمة البيع");
      totalFils = integer(totalFils + lineTotalFils, "إجمالي البيع");
      return { productId: doc.id, productNameSnapshot: product.name, category:product.category ?? "OTHER", quantity: items[i].quantity, unitPriceFils: price, lineTotalFils };
    });
    const inventory = await prepareNewInventory(tx, db, items, false, { operationId: `sale:${saleRef.id}`, actor: { id: input.employeeId, name: input.employeeName, type: "EMPLOYEE" } });
    const now = Timestamp.now();
    inventory.commit();
    tx.create(saleRef, { storeAuthUid: input.storeAuthUid, shiftId: shiftRef.id, employeeId: input.employeeId, employeeNameSnapshot: input.employeeName, requestFingerprint: fingerprint, items: saleItems, paymentMethod: input.paymentMethod, totalFils, inventoryPlan: inventory.plan, createdAt: now });
    tx.update(shiftRef, { saleCount: integer((shift.saleCount ?? 0) + 1, "عدد المبيعات"), totalSalesFils: integer((shift.totalSalesFils ?? 0) + totalFils, "إجمالي الشفت"), cashSalesFils: integer((shift.cashSalesFils ?? 0) + (input.paymentMethod === "CASH" ? totalFils : 0), "كاش الشفت"), clickSalesFils: integer((shift.clickSalesFils ?? 0) + (input.paymentMethod === "CLICK" ? totalFils : 0), "كليك الشفت"), updatedAt: now });
    return { saleId: saleRef.id, totalFils, paymentMethod: input.paymentMethod, createdAt: now.toDate() };
  });
}
