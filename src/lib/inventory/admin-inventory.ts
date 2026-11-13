import "server-only";
import { Timestamp, type DocumentSnapshot } from "firebase-admin/firestore";
import { z } from "zod";
import { getFirebaseAdminFirestore } from "@/lib/firebase/admin";
import { capacityMl, coolerType } from "./item-rules";
import { formatJordanPhoneLocal } from "@/lib/customers/customer-phone";
import { InventoryError, assertItem, integer, keyFor, stockCollections as C } from "./stock-engine";
import type { InventoryPolicy, StockItem } from "@/types/inventory";

const id = z.string().regex(/^[A-Za-z0-9_-]{1,150}$/);
const quantity = z.number().int().min(0).max(1_000_000_000);
const positive = quantity.min(1);
const text = z.string().trim().min(2).max(160);
const origin = z.enum(["JORDANIAN", "SAUDI", "DEFAULT"]);
const itemDefinitionSchema = z.object({ name: text, brand: z.string().trim().max(80), size: z.string().trim().max(80), kind: z.enum(["GOODS", "CONSUMABLE", "BOTTLE_POOL"]), baseUnit: text, packLabel: text, unitsPerPack: positive.max(1_000_000), origin, lowStock: quantity });
export const inventoryCommandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("CREATE_ITEM"), ...itemDefinitionSchema.shape }).strict(),
  z.object({ action: z.literal("EDIT_ITEM"), ...itemDefinitionSchema.shape, itemId: id, expectedDefinitionVersion: quantity, reason: z.string().trim().max(500).default("تسجيل إجراء من الإدارة") }).strict(),
  z.object({ action: z.literal("UPDATE_ITEM"), itemId: id, active: z.boolean(), lowStock: quantity }).strict(),
  z.object({ action: z.enum(["RECEIVE", "CONSUME", "WASTE", "ADJUST", "REVIEW_RETURN", "REVIEW_WASTE"]), itemId: id, quantity, unit: z.enum(["PACK", "BASE"]), location: z.enum(["ROOM", "COOLER"]), reason: z.string().trim().max(500).default("تسجيل إجراء من الإدارة"), supplier: z.string().trim().max(160), totalCostFils: quantity, expectedBalance: z.object({ room: quantity, cooler: quantity, reservedRoom: quantity, reservedCooler: quantity }).strict().optional() }).strict(),
  z.object({ action: z.literal("TRANSFER"), itemId: id, quantity: positive, unit: z.enum(["PACK", "BASE"]), to: z.enum(["ROOM", "COOLER"]), reason: z.string().trim().max(500).default("تسجيل إجراء من الإدارة") }).strict(),
  z.object({ action: z.literal("SET_POLICY"), productId: id, mode: z.enum(["STOCK", "REFILL", "EXEMPT"]), itemId: z.string().max(150), unitsPerSale: positive.max(1_000_000), location: z.enum(["ROOM", "COOLER"]), reason: z.string().trim().max(500).default("تسجيل إجراء من الإدارة"), consumables: z.array(z.object({ itemId: id, quantity: positive.max(1_000_000) }).strict()).max(10), pools: z.array(z.object({ origin, itemId: id, quantity: positive.max(100) }).strict()).max(3) }).strict(),
  z.object({ action: z.literal("SET_ACTIVE"), active: z.boolean(), reason: z.string().trim().max(500).default("تسجيل إجراء من الإدارة") }).strict(),
  z.object({ action: z.literal("RETURN_DEBT"), debtId: id, quantity: positive, reason: z.string().trim().max(500).default("تسجيل إجراء من الإدارة"), disposition: z.enum(["RETURNED", "LOST"]) }).strict(),
  z.object({ action: z.literal("CREATE_COOLED"), productId: id, storePriceFils: quantity.max(10_000_000), deliveryPriceFils: quantity.max(10_000_000) }).strict(),
  z.object({ action: z.literal("OPEN_DEBT"), customerId: id, itemId: id, quantity: positive, reason: z.string().trim().max(500).default("تسجيل إجراء من الإدارة") }).strict(),
]);
export const inventoryRequestSchema = z.object({ requestId: z.string().uuid(), command: inventoryCommandSchema }).strict();
export type InventoryCommand = z.infer<typeof inventoryCommandSchema>;
const normalize = (s: string) => s.normalize("NFKC").trim().toLocaleLowerCase("ar").replace(/[\u064B-\u065F\u0670\u0640]/g, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 1632)).replace(/\s+/g, " ");
const date = (v: unknown) => v instanceof Timestamp ? v.toDate().toISOString() : null;
function definitionOf(item: z.infer<typeof itemDefinitionSchema>) { return { name: item.name, brand: item.brand, size: item.size, kind: item.kind, baseUnit: item.baseUnit, packLabel: item.packLabel, unitsPerPack: item.unitsPerPack, origin: item.origin, lowStock: item.lowStock }; }
export function definitionKey(item: z.infer<typeof itemDefinitionSchema>) {
  return keyFor(JSON.stringify([item.brand && item.size ? "" : item.name, item.brand, item.size, item.kind, item.baseUnit, String(item.unitsPerPack), item.origin].map(normalize)));
}

export async function inventorySnapshot() {
  const db = getFirebaseAdminFirestore();
  const [items, policies, products, settings, debts] = await Promise.all([
    db.collection(C.items).get(), db.collection(C.policies).get(),
    db.collection("products").get(), db.collection(C.settings).doc("main").get(),
    db.collection(C.debts).where("quantity", ">", 0).get(),
  ]);
  return {
    active: settings.data()?.active === true,
    items: items.docs.map(d => assertItem(d.data(), d.id)).filter(i => !i.trashed).sort((a, b) => a.code.localeCompare(b.code)),
    policies: policies.docs.map(d => {
      const p = d.data();
      return { productId: d.id, mode: p.mode, itemId: p.itemId, unitsPerSale: p.unitsPerSale, location: p.location, reason: p.reason ?? "", consumables: p.consumables.map((r: { itemId: string; quantity: number }) => ({ itemId: r.itemId, quantity: r.quantity })), pools: p.pools.map((r: { origin: string; itemId: string; quantity: number }) => ({ origin: r.origin, itemId: r.itemId, quantity: r.quantity })) } as InventoryPolicy;
    }),
    products: products.docs.filter(d => !d.data().isDeleted).map(d => {
      const p = d.data();
      return { id: d.id, name: p.name as string, category: p.category as string, requiresBottleOrigin: p.requiresBottleOrigin === true, active: p.isActive === true, storePriceFils: p.storePriceFils as number, deliveryPriceFils: p.deliveryPriceFils as number };
    }),
    debts: debts.docs.map(d => ({ id: d.id, ...d.data(), updatedAt: date(d.data().updatedAt) })),
  };
}
export async function inventoryMovements(cursor?: string, itemId?: string) {
  const db = getFirebaseAdminFirestore();
  // History uses one ordered field. Filtering by item happens in a bounded
  // page, with the same cursor, so it never claims to be the entire history.
  let query = db.collection(C.movements).orderBy("createdAt", "desc").limit(51);
  if (cursor) {
    const doc = await db.collection(C.movements).doc(cursor).get();
    if (!doc.exists) throw new InventoryError("INVALID_CURSOR", "أعد تحميل سجل الحركات.");
    query = query.startAfter(doc);
  }
  const snapshot = await query.get();
  const page = snapshot.docs.slice(0, 50);
  return { rows: page.filter(d => !itemId || d.data().itemId === itemId).map(d => ({ id: d.id, ...d.data(), createdAt: date(d.data().createdAt) })), hasMore: snapshot.size > 50, nextCursor: snapshot.size > 50 ? page.at(-1)!.id : null };
}

export async function executeInventoryCommand(request: z.infer<typeof inventoryRequestSchema>, adminUid: string) {
  const db = getFirebaseAdminFirestore();
  const command = request.command;
  const opId = keyFor(`${adminUid}:${request.requestId}`);
  const opRef = db.collection(C.operations).doc(opId);
  const fingerprint = keyFor(JSON.stringify(command));
  return db.runTransaction(async tx => {
    const previous = await tx.get(opRef);
    if (previous.exists) {
      if (previous.data()?.fingerprint !== fingerprint) throw new InventoryError("REQUEST_REUSED", "رقم العملية مستخدم لبيانات مختلفة. أعد فتح النموذج.");
      return { unchanged: true };
    }
    const now = Timestamp.now();
    const finish = () => tx.create(opRef, { fingerprint, action: command.action, command, adminUid, createdAt: now });
    const movement = (item: StockItem, changes: Record<string, number>, details: Record<string, unknown> = {}) => {
      tx.create(db.collection(C.movements).doc(keyFor(`${opId}:${item.id}`)), { itemId: item.id, itemName: item.name, code: item.code, unit: item.baseUnit, unitsPerPack: item.unitsPerPack, packLabel: item.packLabel, kind: command.action, operationId: opId, actor: { id: adminUid, name: "الإدارة", type: "ADMIN" }, ...details, changes, balances: { room: item.room, cooler: item.cooler, reservedRoom: item.reservedRoom, reservedCooler: item.reservedCooler, out: item.out, owed: item.owed, review: item.review }, createdAt: now });
    };
    const requireUnique = async (lock: DocumentSnapshot | null, label: string, ownId?: string) => {
      if (!lock?.exists || (ownId !== undefined && lock.data()?.itemId === ownId)) return;
      const duplicateId = lock.data()?.itemId;
      const duplicate = typeof duplicateId === "string" ? (await tx.get(db.collection(C.items).doc(duplicateId))).data() : null;
      const kinds: Record<string, string> = { GOODS: "بضاعة للبيع", CONSUMABLE: "مادة تشغيلية", BOTTLE_POOL: "قوارير توزيع مستعملة" };
      throw new InventoryError("DUPLICATE_ITEM", duplicate ? `${label} مسجل مسبقًا للصنف «${duplicate.name}» (${duplicate.code})، وتصنيفه «${kinds[duplicate.kind] ?? duplicate.kind}». راجع الصنف الموجود أو صحّح التصنيف وأصل القارورة؛ تغيير الاسم وحده لا يعرّف صنفًا مختلفًا.` : `${label} مسجل مسبقًا. راجع الصنف الموجود قبل إنشاء تعريف آخر.`);
    };
    if (command.action === "EDIT_ITEM") {
      const ref = db.collection(C.items).doc(command.itemId);
      const item = assertItem((await tx.get(ref)).data(), command.itemId);
      if ((item.definitionVersion ?? 0) !== command.expectedDefinitionVersion) throw new InventoryError("STALE_DEFINITION", "تغيّر تعريف الصنف بعد فتح النموذج. أغلقه وحدّث المخزون ثم أعد التعديل.");
      const unitChanged = normalize(item.baseUnit) !== normalize(command.baseUnit) || item.unitsPerPack !== command.unitsPerPack;
      const structural = unitChanged || item.kind !== command.kind || item.origin !== command.origin;
      if (structural) {
        const [policies, orders, history] = await Promise.all([tx.get(db.collection(C.policies)), tx.get(db.collection("deliveryOrders").where("status", "in", ["NEW", "READY"])), tx.get(db.collection(C.movements).where("itemId", "==", item.id))]);
        const linked = policies.docs.find(d => { const p = d.data() as InventoryPolicy; return p.mode === "STOCK" ? p.itemId === item.id : p.mode === "REFILL" && [...p.consumables, ...p.pools].some(row => row.itemId === item.id); });
        if (linked) throw new InventoryError("ITEM_LINKED", "هذا الصنف مربوط بمنتج بيع أو وصفة تعبئة. راجع الربط أولًا قبل تغيير تصنيفه أو أصله أو وحدته. يمكنك تعديل اسمه ووصفه دون تغيير الربط.");
        const pending = orders.docs.some(d => { const p = d.data().inventoryPlan; return p && [...(p.allocations ?? []), ...(p.consumables ?? [])].some((row: { itemId: string }) => row.itemId === item.id); });
        const hasObligation = item.reservedRoom + item.reservedCooler + item.out + item.owed + item.review > 0;
        if (pending || hasObligation) throw new InventoryError("ITEM_IN_USE", "على الصنف حجز أو طلب أو عهدة أو كمية بانتظار المراجعة. لا يمكن تغيير تصنيفه أو أصله أو وحدته قبل تسويتها.");
        const operationalKinds = new Set(["RESERVE", "DIRECT_SALE", "READY", "DELIVERED", "CANCELLED", "OPEN_DEBT", "RETURN_DEBT", "REVIEW_RETURN", "REVIEW_WASTE"]);
        if (history.docs.some(d => operationalKinds.has(d.data().kind))) throw new InventoryError("ITEM_HISTORY_LOCKED", "للصنف سجل تشغيل أو عهدة سابقة. لحماية السجل لا يُحوّل إلى نوع آخر؛ عرّف الصنف الصحيح وسوِّ الأرصدة بحركات واضحة.");
        if (unitChanged && (history.size > 0 || item.room + item.cooler > 0)) throw new InventoryError("UNIT_HISTORY_LOCKED", "لا يمكن تغيير الوحدة الأساسية أو عدد الوحدات في العبوة بعد تسجيل حركة أو رصيد. أنشئ تعريفًا بالوحدة الصحيحة بدل إعادة تفسير الكميات السابقة.");
        if (command.kind !== "GOODS" && item.cooler > 0) throw new InventoryError("INVALID_LOCATION", "أعد الكمية الموجودة بالثلاجة إلى المستودع قبل تحويل الصنف إلى مواد تشغيلية أو قوارير توزيع.");
      }
      const nextKey = definitionKey(command);
      const oldSpecRef = db.collection("inventoryUniqueKeys").doc(`spec_${item.identityKey}`);
      const nextSpecRef = db.collection("inventoryUniqueKeys").doc(`spec_${nextKey}`);
      const [oldSpec, nextSpec] = await Promise.all([tx.get(oldSpecRef), tx.get(nextSpecRef)]);
      if (oldSpec.exists && oldSpec.data()?.itemId !== item.id) throw new InventoryError("IDENTITY_INCONSISTENT", "ربط هوية الصنف يحتاج مراجعة؛ لم يتم تغيير أي بيانات.");
      await requireUnique(nextSpec, "هذه المواصفات", item.id);
      // Every lookup is complete before changing locks or the definition. The
      // same immutable item ID/code and all balances survive this correction.
      if (item.identityKey !== nextKey && oldSpec.exists) tx.delete(oldSpecRef);
      tx.set(nextSpecRef, { itemId: item.id });
      const next = definitionOf(command);
      tx.update(ref, { ...next, identityKey: nextKey, definitionVersion: integer((item.definitionVersion ?? 0) + 1, "نسخة التعريف"), updatedAt: now, updatedBy: adminUid });
      movement({ ...item, ...next }, {}, { reason: command.reason, definitionBefore: definitionOf(item), definitionAfter: next }); finish();
      return { itemId: item.id, code: item.code };
    }
    if (command.action === "CREATE_ITEM") {
      const identityKey = definitionKey(command);
      const keyRef = db.collection("inventoryUniqueKeys").doc(`spec_${identityKey}`);
      const counterRef = db.collection(C.settings).doc("sequence");
      const [existing, counter] = await Promise.all([tx.get(keyRef), tx.get(counterRef)]);
      await requireUnique(existing, "هذه المواصفات");
      const sequence = integer((counter.data()?.last ?? 0) + 1, "رقم الصنف", 1);
      const itemId = keyFor(`item:${opId}`);
      const item = { ...command, id: itemId, code: `ITM-${String(sequence).padStart(6, "0")}`, identityKey, definitionVersion: 1, active: true, room: 0, cooler: 0, reservedRoom: 0, reservedCooler: 0, out: 0, owed: 0, review: 0 };
      const { action: _action, ...record } = item;
      void _action;
      tx.create(db.collection(C.items).doc(itemId), { ...record, createdBy: adminUid, createdAt: now, updatedAt: now });
      tx.create(keyRef, { itemId });
      tx.set(counterRef, { last: sequence }); finish(); return { itemId };
    }
    if (command.action === "SET_ACTIVE") {
      // Even old in-flight orders must settle against their saved stock plan.
      // Deactivation therefore stops new plans without reversing existing ones.
      if (command.active) {
        const [products, policies, items, pendingOrders] = await Promise.all([tx.get(db.collection("products")), tx.get(db.collection(C.policies)), tx.get(db.collection(C.items)), tx.get(db.collection("deliveryOrders").where("status", "in", ["NEW", "READY"]))]);
        const map = new Map(policies.docs.map(d => [d.id, d.data()]));
        const stock = new Map(items.docs.map(d => [d.id, assertItem(d.data(), d.id)]));
        for (const doc of products.docs) {
          const p = doc.data(); if (p.isDeleted || !p.isActive) continue;
          const policy = map.get(doc.id);
          if (!policy) throw new InventoryError("INCOMPLETE_SETUP", `اربط المنتج «${p.name}» بالمخزون أولًا أو سجّله كاستثناء من التتبع.`);
          const linked = policy.mode === "STOCK" ? [policy.itemId] : policy.mode === "REFILL" ? [...policy.consumables.map((r: { itemId: string }) => r.itemId), ...(p.deliveryEnabled !== false ? policy.pools.map((r: { itemId: string }) => r.itemId) : [])] : [];
          if (linked.some((id: string) => !stock.get(id)?.active)) throw new InventoryError("INCOMPLETE_SETUP", `راجع الأصناف المرتبطة بالمنتج «${p.name}».`);
          if (policy.mode === "REFILL" && !policy.consumables.length) throw new InventoryError("INCOMPLETE_SETUP", `أكمل مواد التعبئة للمنتج «${p.name}».`);
          if (policy.mode === "REFILL" && p.deliveryEnabled !== false && policy.autoBottlePools && (!["JORDANIAN", "SAUDI"].every(origin => [...stock.values()].filter(i => i.active && !i.trashed && i.kind === "BOTTLE_POOL" && i.origin === origin && (i.bottleSizeMl || capacityMl(i.size)) === policy.bottleSizeMl).length === 1))) throw new InventoryError("INCOMPLETE_SETUP", `أكمل مواد التعبئة وقوارير التوصيل المطابقة لحجم «${p.name}».`);
          if (policy.mode === "REFILL" && p.deliveryEnabled !== false && !policy.autoBottlePools && !(p.requiresBottleOrigin ? ["JORDANIAN", "SAUDI"] : ["DEFAULT"]).every(o => policy.pools.some((r: { origin: string }) => r.origin === o))) throw new InventoryError("INCOMPLETE_SETUP", `أكمل أرصدة قوارير التوصيل للمنتج «${p.name}».`);
        }
        if (pendingOrders.docs.some(d => !d.data().inventoryPlan)) throw new InventoryError("LEGACY_ORDERS_PENDING", "أغلق أو ألغِ الطلبات القديمة المعلّقة غير المرتبطة بالمخزون، ثم راجع الجرد قبل التفعيل.");
      }
      tx.set(db.collection(C.settings).doc("main"), { active: command.active, reason: command.reason, updatedBy: adminUid, updatedAt: now }, { merge: true }); finish(); return {};
    }
    if (command.action === "SET_POLICY" || command.action === "CREATE_COOLED") {
      const productRef = db.collection("products").doc(command.productId);
      const productDoc = await tx.get(productRef);
      const product = productDoc.data();
      if (!product || product.isDeleted) throw new InventoryError("PRODUCT_MISSING", "المنتج غير موجود.");
      if (command.action === "CREATE_COOLED") {
        const policyDoc = await tx.get(db.collection(C.policies).doc(command.productId));
        const policy = policyDoc.data() as InventoryPolicy | undefined;
        if (!policy || policy.mode !== "STOCK" || policy.location !== "ROOM") throw new InventoryError("LINK_FIRST", "اربط المنتج العادي بصنف مخزون المستودع أولًا.");
        const stock = assertItem((await tx.get(db.collection(C.items).doc(policy.itemId))).data(), policy.itemId);
        if (stock.kind !== "GOODS" || !stock.active) throw new InventoryError("INVALID_ITEM", "الصنف غير مناسب للتبريد.");
        const coldId = `cooled_${keyFor(command.productId).slice(0, 32)}`;
        const coldRef = db.collection("products").doc(coldId);
        if ((await tx.get(coldRef)).exists) throw new InventoryError("COOLED_EXISTS", "النسخة المبردة موجودة بالفعل. عدّل سعرها من صفحة الأسعار.");
        tx.create(coldRef, { name: `${product.name} — مبرد`, category: "COOLED", storePriceFils: command.storePriceFils, deliveryPriceFils: command.deliveryPriceFils, isActive: true, showForEmployee: true, showForCustomerApp: product.showForCustomerApp === true, requiresBottleOrigin: false, imageUrl: product.imageUrl ?? null, isDeleted: false, createdByAuthUid: adminUid, updatedByAuthUid: adminUid, deletedByAuthUid: null, deletedAt: null, createdAt: now, updatedAt: now });
        tx.set(db.collection(C.policies).doc(coldId), { ...policy, productId: coldId, location: "COOLER", updatedAt: now, updatedBy: adminUid }); finish(); return { productId: coldId };
      }
      if ((product.category === "REFILL") !== (command.mode === "REFILL") && command.mode !== "EXEMPT") throw new InventoryError("INVALID_POLICY", "التعبئة تربط بوصفة استهلاك؛ البضاعة تربط برصيد مخزون.");

      if (command.mode === "REFILL" && !command.consumables.length) throw new InventoryError("RECIPE_REQUIRED", "حدد مواد التعبئة وكمياتها.");
      if (new Set(command.consumables.map(r => r.itemId)).size !== command.consumables.length || new Set(command.pools.map(r => r.origin)).size !== command.pools.length) throw new InventoryError("DUPLICATE_RECIPE", "توجد مادة أو نوع قارورة مكرر في الربط.");
      const refs = command.mode === "STOCK" ? [command.itemId] : command.mode === "REFILL" ? [...command.consumables.map(r => r.itemId), ...command.pools.map(r => r.itemId)] : [];
      const docs = await Promise.all([...new Set(refs)].map(itemId => { if (!/^[A-Za-z0-9_-]{1,150}$/.test(itemId)) throw new InventoryError("INVALID_ITEM", "اختر صنف المخزون."); return tx.get(db.collection(C.items).doc(itemId)); }));
      const items = new Map(docs.map(d => [d.id, assertItem(d.data(), d.id)]));
      if ([...items.values()].some(item => !item.active)) throw new InventoryError("INACTIVE_ITEM", "أحد الأصناف المختارة موقوف.");
      if (command.mode === "STOCK" && items.get(command.itemId)?.kind !== "GOODS") throw new InventoryError("INVALID_ITEM", "اختر بضاعة قابلة للبيع.");
      if (command.mode === "REFILL") {
        if (command.consumables.some(r => items.get(r.itemId)?.kind !== "CONSUMABLE")) throw new InventoryError("INVALID_RECIPE", "وصفة التعبئة تقبل مواد تشغيلية فقط.");
        if (command.pools.some(r => items.get(r.itemId)?.kind !== "BOTTLE_POOL" || items.get(r.itemId)?.origin !== r.origin)) throw new InventoryError("INVALID_POOL", "نوع القارورة لا يطابق رصيد القوارير المختار.");
        if (!(product.requiresBottleOrigin ? ["JORDANIAN", "SAUDI"] : ["DEFAULT"]).every(o => command.pools.some(p => p.origin === o))) throw new InventoryError("INVALID_POOL", "أكمل ربط أنواع القوارير المطلوبة لهذا المنتج.");
      }
      const { action: _action, ...policy } = command; void _action;
      tx.set(db.collection(C.policies).doc(command.productId), { ...policy, updatedBy: adminUid, updatedAt: now }); finish(); return {};
    }
    if (command.action === "OPEN_DEBT") {
      const itemRef = db.collection(C.items).doc(command.itemId);
      const debtRef = db.collection(C.debts).doc(keyFor(`${command.customerId}:${command.itemId}`));
      const [itemDoc, customerDoc, debtDoc] = await Promise.all([tx.get(itemRef), tx.get(db.collection("customers").doc(command.customerId)), tx.get(debtRef)]);
      const item = assertItem(itemDoc.data(), command.itemId), customer = customerDoc.data(), old = debtDoc.data();
      if (item.kind !== "BOTTLE_POOL" || !customer || customer.isArchived) throw new InventoryError("INVALID_DEBT", "اختر عميلًا متاحًا وصنف قوارير توزيع.");
      item.owed = integer(item.owed + command.quantity, item.name);
      tx.update(itemRef, { owed: item.owed, updatedAt: now });
      tx.set(debtRef, { customerId: command.customerId, customerName: customer.name, itemId: item.id, itemName: item.name, origin: item.origin, quantity: integer((old?.quantity ?? 0) + command.quantity, "عهدة العميل"), updatedAt: now }, { merge: true });
      movement(item, { owed: command.quantity }, { customerId: command.customerId, customerName: customer.name, reason: command.reason, source: "OPENING_DEBT" }); finish(); return {};
    }
    if (command.action === "RETURN_DEBT") {
      const ref = db.collection(C.debts).doc(command.debtId);
      const debt = (await tx.get(ref)).data();
      if (!debt || command.quantity > integer(debt.quantity, "العهدة")) throw new InventoryError("INVALID_DEBT", "العدد أكبر من العهدة المستحقة.");
      const itemRef = db.collection(C.items).doc(debt.itemId);
      const item = assertItem((await tx.get(itemRef)).data(), debt.itemId);
      const roomDelta = command.disposition === "RETURNED" ? command.quantity : 0;
      item.owed = integer(item.owed - command.quantity, item.name); item.room = integer(item.room + roomDelta, item.name);
      tx.update(itemRef, { owed: item.owed, room: item.room, updatedAt: now });
      tx.update(ref, { quantity: debt.quantity - command.quantity, updatedAt: now });
      movement(item, { owed: -command.quantity, room: roomDelta }, { customerId: debt.customerId, customerName: debt.customerName, reason: command.reason, disposition: command.disposition }); finish(); return {};
    }
    const ref = db.collection(C.items).doc(command.itemId);
    const item = assertItem((await tx.get(ref)).data(), command.itemId);
    if (command.action === "UPDATE_ITEM") {
      tx.update(ref, { active: command.active, lowStock: command.lowStock, definitionVersion: integer((item.definitionVersion ?? 0) + 1, "نسخة التعريف"), updatedAt: now, updatedBy: adminUid }); finish(); return {};
    }
    if ((command.action === "WASTE" || command.action === "REVIEW_WASTE") && item.kind !== "BOTTLE_POOL") throw new InventoryError("BOTTLE_WASTE_ONLY", "تسجيل التالف مخصص للقوارير المستعملة فقط.");
    if (command.action === "TRANSFER" && command.to === "COOLER" || "location" in command && command.location === "COOLER" && command.action !== "REVIEW_RETURN") {
      const [products, policies] = await Promise.all([tx.get(db.collection("products")), tx.get(db.collection(C.policies))]);
      const links = policies.docs.filter(d => d.data().mode === "STOCK" && d.data().itemId === item.id && d.data().location === "COOLER");
      const normal = policies.docs.find(d => d.data().mode === "STOCK" && d.data().itemId === item.id && d.data().location === "ROOM");
      const category = item.catalogType ?? products.docs.find(d => d.id === normal?.id)?.data().category ?? "";
      if (!coolerType(category) || !links.some(p => products.docs.some(d => d.id === p.id && d.data().isActive && !d.data().isDeleted))) throw new InventoryError("NOT_COOLABLE", "هذا الصنف غير مضاف للثلاجة. المسموح كراتين الأكواب والشرنك فقط؛ أضفه من صفحة الثلاجة.");
    }
    if (command.action === "RECEIVE" && !item.active) throw new InventoryError("ARCHIVED", "استعد الصنف من الأرشيف قبل التوريد.");
    const amount = integer(command.quantity * (command.unit === "PACK" ? item.unitsPerPack : 1), item.name);
    if (command.action === "ADJUST") {
      const expected = command.expectedBalance;
      if (!expected || (["room", "cooler", "reservedRoom", "reservedCooler"] as const).some(field => expected[field] !== item[field])) throw new InventoryError("STALE_COUNT", "تغيّر الرصيد بعد فتح نموذج الجرد. أغلقه وحدّث الصفحة ثم أعد عدّ الكمية.");
    } else if (amount < 1) throw new InventoryError("INVALID_QUANTITY", "أدخل كمية موجبة للحركة.");
    const changes: Record<string, number> = {};
    const add = (field: "room" | "cooler" | "review", delta: number) => { item[field] = integer(item[field] + delta, item.name); changes[field] = (changes[field] ?? 0) + delta; };
    if (command.action === "TRANSFER") {
      if (item.kind !== "GOODS") throw new InventoryError("INVALID_TRANSFER", "النقل للثلاجة مخصص للبضاعة القابلة للبيع.");
      const target = command.to === "ROOM" ? "room" : "cooler";
      add(target === "room" ? "cooler" : "room", -amount); add(target, amount);
    } else {
      const field = command.location === "ROOM" ? "room" : "cooler";
      if (field === "cooler" && item.kind !== "GOODS") throw new InventoryError("INVALID_LOCATION", "هذا الصنف لا يُخزن في الثلاجة.");
      if (command.action === "RECEIVE") { if (!amount) throw new InventoryError("INVALID_QUANTITY", "أدخل كمية توريد موجبة."); add(field, amount); }
      else if (command.action === "ADJUST") add(field, amount - item[field]);
      else if (command.action === "REVIEW_RETURN" || command.action === "REVIEW_WASTE") { add("review", -amount); if (command.action === "REVIEW_RETURN") add(field, amount); }
      else {
        if (command.action === "CONSUME" && item.kind !== "CONSUMABLE") throw new InventoryError("INVALID_CONSUMPTION", "الصرف اليدوي للمواد التشغيلية فقط.");
        add(field, -amount);
      }
    }
    if (item.room < item.reservedRoom || item.cooler < item.reservedCooler) throw new InventoryError("RESERVED_STOCK", "الكمية محجوزة لطلبات قائمة؛ لا يمكن تعديلها أو نقلها.");
    tx.update(ref, { room: item.room, cooler: item.cooler, review: item.review, updatedAt: now });
    movement(item, changes, { reason: command.reason, ...("supplier" in command ? { supplier: command.supplier, totalCostFils: command.totalCostFils } : {}) }); finish(); return {};
  });
}
export async function customerBottleDebts(customerId: string) {
  const docs = await getFirebaseAdminFirestore().collection(C.debts).where("customerId", "==", customerId).get();
  return docs.docs.filter(d => d.data().quantity > 0).map(d => ({ id: d.id, itemName: d.data().itemName as string, quantity: d.data().quantity as number, updatedAt: date(d.data().updatedAt) }));
}
export async function inventorySummary() {
  const db = getFirebaseAdminFirestore();
  const [items, settings] = await Promise.all([db.collection(C.items).select("room", "cooler", "reservedRoom", "reservedCooler", "lowStock", "review", "active", "trashed").get(), db.collection(C.settings).doc("main").get()]);
  return {
    configured: items.docs.some(d => !d.data().trashed),
    active: settings.data()?.active === true,
    low: items.docs.filter(d => { const i = d.data(); return i.active && i.room + i.cooler - i.reservedRoom - i.reservedCooler <= i.lowStock; }).length,
    review: items.docs.filter(d => !d.data().trashed && d.data().review > 0).length,
    coolerTypes: items.docs.filter(d => !d.data().trashed && d.data().cooler > 0).length,
  };
}
export async function searchInventoryCustomers(query: string) {
  if (query.length < 2 || query.length > 80) return [];
  const docs = await getFirebaseAdminFirestore().collection("customers").select("name", "phoneNormalized", "isArchived").get();
  const q = normalize(query);
  return docs.docs.filter(d => { const c = d.data(); return !c.isArchived && (normalize(c.name ?? "").includes(q) || String(c.phoneNormalized ?? "").includes(q) || formatJordanPhoneLocal(c.phoneNormalized ?? "").includes(q)); }).slice(0, 10).map(d => ({ id: d.id, name: d.data().name as string, phone: formatJordanPhoneLocal(d.data().phoneNormalized ?? "") }));
}
