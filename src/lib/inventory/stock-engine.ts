import "server-only";
import { createHash } from "node:crypto";
import { Timestamp, type Firestore, type Transaction, type DocumentData } from "firebase-admin/firestore";
import { capacityMl, coolerType } from "./item-rules";
import type { BottleReturn, InventoryPlan, InventoryPolicy, StockItem, StockLocation } from "@/types/inventory";

export class InventoryError extends Error {
  constructor(public code: string, message: string) { super(message); this.name = "InventoryError"; }
}
export const keyFor = (value: string) => createHash("sha256").update(value).digest("hex");
export const stockCollections = { items: "inventoryItems", policies: "inventoryPolicies", movements: "inventoryMovements", settings: "inventorySettings", debts: "bottleDebtAccounts", operations: "inventoryOperations" } as const;
export function integer(value: unknown, label: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > 1_000_000_000) throw new InventoryError("INVALID_QUANTITY", `${label}: كمية غير صالحة.`);
  return value as number;
}
export function assertItem(data: DocumentData | undefined, id: string): StockItem {
  if (!data) throw new InventoryError("ITEM_MISSING", "أحد أصناف المخزون غير موجود.");
  for (const field of ["room", "cooler", "reservedRoom", "reservedCooler", "out", "owed", "review"]) integer(data[field], data.name ?? "الصنف");
  if (data.reservedRoom > data.room || data.reservedCooler > data.cooler) throw new InventoryError("INVALID_STOCK", "حجز المخزون غير متسق. راجع الإدارة.");
  return { ...data, id } as StockItem;
}
export type InventoryLine = { productId: string; quantity: number; bottleOrigin?: "JORDANIAN" | "SAUDI" | null };
type Actor = { id: string; name: string; type: "ADMIN" | "EMPLOYEE" };
type Context = { operationId: string; actor: Actor; customerId?: string; customerName?: string; orderId?: string; note?: string };
type State = Map<string, StockItem>;

// Read-only planning phase. commit() is deliberately deferred so callers may
// finish coupon/shift/customer reads before ANY Firestore transaction writes.
async function readState(tx: Transaction, db: Firestore, ids: string[]): Promise<State> {
  const unique = [...new Set(ids)];
  if (unique.length > 150) throw new InventoryError("TOO_MANY_ITEMS", "عدد أصناف المخزون في العملية كبير.");
  const docs = await Promise.all(unique.map(id => tx.get(db.collection(stockCollections.items).doc(id))));
  return new Map(docs.map(doc => [doc.id, assertItem(doc.data(), doc.id)]));
}
function change(state: State, id: string, field: "room" | "cooler" | "reservedRoom" | "reservedCooler" | "out" | "owed" | "review", delta: number) {
  const item = state.get(id);
  if (!item) throw new InventoryError("ITEM_MISSING", "صنف المخزون غير موجود.");
  item[field] = integer(item[field] + delta, item.name);
}
function ensureAvailable(state: State) {
  for (const item of state.values()) {
    if (item.reservedRoom > item.room || item.reservedCooler > item.cooler) throw new InventoryError("INSUFFICIENT_STOCK", `الكمية المتاحة غير كافية للصنف «${item.name}».`);
  }
}
function take(state: State, id: string, location: StockLocation, quantity: number) {
  const item = state.get(id)!;
  const field = location === "ROOM" ? "room" : "cooler";
  if (item[field] < quantity) throw new InventoryError("INSUFFICIENT_STOCK", `الكمية غير كافية للصنف «${item.name}».`);
  change(state, id, field, -quantity);
}
function writer(db: Firestore, tx: Transaction, state: State, before: State, kind: string, context: Context, extras: Record<string, unknown> = {}) {
  return () => {
    const now = Timestamp.now();
    for (const [id, item] of state) {
      const old = before.get(id)!;
      const fields = ["room", "cooler", "reservedRoom", "reservedCooler", "out", "owed", "review"] as const;
      const changes = fields.filter(f => item[f] !== old[f]);
      if (!changes.length) continue;
      const balances = Object.fromEntries(fields.map(f => [f, item[f]]));
      tx.update(db.collection(stockCollections.items).doc(id), { ...balances, updatedAt: now });
      tx.create(db.collection(stockCollections.movements).doc(keyFor(`${context.operationId}:${id}`)), {
        itemId: id, itemName: item.name, code: item.code, unit: item.baseUnit, unitsPerPack: item.unitsPerPack, packLabel: item.packLabel, kind, ...context, ...extras,
        changes: Object.fromEntries(changes.map(f => [f, item[f] - old[f]])), balances, createdAt: now,
      });
    }
  };
}
function clone(state: State): State { return new Map([...state].map(([id, item]) => [id, { ...item }])); }

export async function prepareNewInventory(tx: Transaction, db: Firestore, lines: InventoryLine[], delivery: boolean, context: Context) {
  const settings = await tx.get(db.collection(stockCollections.settings).doc("main"));
  if (settings.data()?.active !== true) return { plan: null, commit() {} };
  const policies = await Promise.all(lines.map(line => tx.get(db.collection(stockCollections.policies).doc(line.productId))));
  let automaticPools: StockItem[] | null = null;
  let centralRecipe: Array<{ itemId: string; quantity: number }> | null = null;
  const plan: InventoryPlan = { version: 1, allocations: [], consumables: [] };
  if(delivery)plan.merchandiseDeductionStage="DELIVERED";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    integer(line.quantity, "المنتج", 1);
    const policy = policies[i].data() as InventoryPolicy | undefined;
    if (!policy) throw new InventoryError("POLICY_MISSING", "أحد المنتجات غير مربوط بالمخزون. راجع الإدارة.");
    if (delivery && policy.deliveryEnabled === false) throw new InventoryError("STORE_ONLY", "هذا الصنف مخصص للبيع داخل المحل فقط.");
    if (policy.mode === "EXEMPT") continue;
    if (policy.mode === "STOCK") {
      plan.allocations.push({ itemId: policy.itemId, quantity: integer(line.quantity * policy.unitsPerSale, "كمية البيع", 1), location: policy.location, role: "SALE", label: "", origin: "DEFAULT" });
    } else if (policy.mode === "REFILL") {
      if (policy.autoBottlePools && centralRecipe === null) { const recipe = await tx.get(db.collection(stockCollections.settings).doc("refillRecipe")); centralRecipe = recipe.data()?.rows ?? []; }
      const materials = policy.autoBottlePools ? centralRecipe! : policy.consumables;
      if (policy.autoBottlePools && !materials.length) throw new InventoryError("RECIPE_REQUIRED", "أكمل الغطاء والختم والكيس من إعداد التعبئة قبل تسجيل تعبئة جديدة.");
      for (const recipe of materials) plan.consumables.push({ itemId: recipe.itemId, quantity: integer(recipe.quantity * line.quantity, "مواد التعبئة", 1) });
      if (delivery) {
        let pool = policy.pools.find(p => p.origin === (line.bottleOrigin ?? "DEFAULT"));
        if (policy.autoBottlePools) {
          if (!line.bottleOrigin) throw new InventoryError("BOTTLE_ORIGIN_REQUIRED", "اختر أردني أو سعودي ضمن طلب التوصيل.");
          if (automaticPools === null) { const docs = await tx.get(db.collection(stockCollections.items)); automaticPools = docs.docs.map(d => assertItem(d.data(), d.id)); }
          const candidates = automaticPools.filter(item => item.active && !item.trashed && item.kind === "BOTTLE_POOL" && item.origin === line.bottleOrigin && (item.bottleSizeMl || capacityMl(item.size)) === policy.bottleSizeMl);
          if (candidates.length !== 1) throw new InventoryError("BOTTLE_POOL_SETUP", candidates.length ? "يوجد تعريفان لقوارير التوصيل بنفس الحجم والأصل. احذف التعريف التجريبي المكرر." : "أدخل رصيد القوارير المستعملة لنفس الحجم والأصل من تبويب قوارير التوصيل؛ الربط تلقائي.");
          pool = { itemId: candidates[0].id, origin: candidates[0].origin, quantity: 1 };
        }
        if (!pool) throw new InventoryError("BOTTLE_POOL_MISSING", "نوع قارورة التوصيل غير مربوط برصيد القوارير المستعملة. راجع الإدارة.");
        plan.allocations.push({ itemId: pool.itemId, quantity: integer(pool.quantity * line.quantity, "قوارير التوصيل", 1), location: "ROOM", role: "BOTTLE", label: "", origin: pool.origin });
      }
    } else throw new InventoryError("INVALID_POLICY", "ربط المخزون غير صالح.");
  }
  const state = await readState(tx, db, [...plan.allocations.map(a => a.itemId), ...plan.consumables.map(a => a.itemId)]);
  if (plan.allocations.some(a => a.role === "SALE" && a.location === "COOLER")) {
    const [products, links] = await Promise.all([tx.get(db.collection("products")), tx.get(db.collection(stockCollections.policies))]);
    for (const a of plan.allocations.filter(a => a.role === "SALE" && a.location === "COOLER")) {
      const item = state.get(a.itemId)!;
      const normal = links.docs.find(d => d.data().mode === "STOCK" && d.data().itemId === item.id && d.data().location === "ROOM");
      const type = item.catalogType ?? products.docs.find(d => d.id === normal?.id)?.data().category ?? "";
      if (!coolerType(type)) throw new InventoryError("NOT_COOLABLE", "خيار المبرد القديم لهذا الصنف غير مسموح. أرجع رصيده للمحل واحفظ بطاقة الصنف لإلغاء خيار التبريد.");
    }
  }
  const before = clone(state);
  for (const a of plan.allocations) {
    const item = state.get(a.itemId)!;
    if (!item.active || (a.role === "BOTTLE" && item.kind !== "BOTTLE_POOL") || (a.role === "SALE" && item.kind !== "GOODS")) throw new InventoryError("ITEM_UNAVAILABLE", "صنف المخزون موقوف أو ربطه غير صحيح.");
    a.label = item.name;
    if (delivery) change(state, a.itemId, a.location === "ROOM" ? "reservedRoom" : "reservedCooler", a.quantity);
    else take(state, a.itemId, a.location, a.quantity);
  }
  for (const a of plan.consumables) {
    const item = state.get(a.itemId)!;
    if (!item.active || item.kind !== "CONSUMABLE") throw new InventoryError("CONSUMABLE_UNAVAILABLE", "إعداد مواد التعبئة غير صالح أو أحد المواد موقوف.");
    if (!delivery) take(state, a.itemId, "ROOM", a.quantity);
  }
  ensureAvailable(state);
  return { plan, commit: writer(db, tx, state, before, delivery ? "RESERVE" : "DIRECT_SALE", context) };
}

export function bottleRequirements(plan: InventoryPlan | null | undefined) {
  const result = new Map<string, { itemId: string; label: string; origin: string; quantity: number }>();
  for (const a of plan?.allocations ?? []) {
    if (a.role !== "BOTTLE") continue;
    const row = result.get(a.itemId) ?? { itemId: a.itemId, label: a.label, origin: a.origin, quantity: 0 };
    row.quantity += a.quantity; result.set(a.itemId, row);
  }
  return [...result.values()];
}

export async function prepareInventoryTransition(tx: Transaction, db: Firestore, plan: InventoryPlan | null | undefined, from: string, action: "READY" | "DELIVERED" | "CANCELLED", returns: BottleReturn[] | undefined, context: Context, previousReturns: BottleReturn[] = []) {
  if (previousReturns.length && (action !== "DELIVERED" || !plan || !bottleRequirements(plan).length)) throw new InventoryError("PREVIOUS_RETURNS_NOT_ALLOWED", "تسوية الفارغ السابق متاحة عند تسليم طلب مرتبط بقوارير التوصيل فقط.");
  if (new Set(previousReturns.map(r => r.itemId)).size !== previousReturns.length) throw new InventoryError("DUPLICATE_RETURNS", "لا تكرر نفس نوع القارورة في الفارغ السابق.");
  for (const row of previousReturns) integer(row.quantity, "الفارغ من طلبات سابقة", 1);
  const recordedPrevious: Array<BottleReturn & { label: string }> = [];
  if (!plan) return { previousReturns: recordedPrevious, commit() {} };
  if (plan.version !== 1) throw new InventoryError("PLAN_VERSION", "نسخة حركة المخزون غير مدعومة.");
  if(plan.merchandiseDeductionStage!==undefined && plan.merchandiseDeductionStage!=="DELIVERED")throw new InventoryError("PLAN_STAGE","مرحلة خصم البضاعة غير مدعومة.");
  const holdGoodsUntilDelivery=plan.merchandiseDeductionStage==="DELIVERED";
  const state = await readState(tx, db, [...plan.allocations.map(a => a.itemId), ...(action === "READY" ? plan.consumables.map(a => a.itemId) : []), ...previousReturns.map(r => r.itemId)]);
  const before = clone(state);
  const debts: Array<{ id: string; quantity: number; item: StockItem }> = [];
  if (action === "READY" || (action === "CANCELLED" && from === "NEW")) {
    for (const a of plan.allocations) {
      if(action==="READY" && holdGoodsUntilDelivery && a.role==="SALE")continue;
      change(state, a.itemId, a.location === "ROOM" ? "reservedRoom" : "reservedCooler", -a.quantity);
      if (action === "READY") {
        take(state, a.itemId, a.location, a.quantity);
        if (a.role === "BOTTLE") change(state, a.itemId, "out", a.quantity);
      }
    }
    if (action === "READY") for (const a of plan.consumables) take(state, a.itemId, "ROOM", a.quantity);
  } else if (action === "CANCELLED" && from === "READY") {
    for (const a of plan.allocations) {
      if(holdGoodsUntilDelivery && a.role==="SALE"){
        change(state,a.itemId,a.location==="ROOM"?"reservedRoom":"reservedCooler",-a.quantity);
        take(state,a.itemId,a.location,a.quantity);
      }
      if (a.role === "BOTTLE") change(state, a.itemId, "out", -a.quantity);
      change(state, a.itemId, "review", a.quantity);
    }
  } else if (action === "DELIVERED") {
    if(holdGoodsUntilDelivery)for(const a of plan.allocations){
      if(a.role!=="SALE")continue;
      change(state,a.itemId,a.location==="ROOM"?"reservedRoom":"reservedCooler",-a.quantity);
      take(state,a.itemId,a.location,a.quantity);
    }
    const expected = bottleRequirements(plan);
    if (expected.length && (!returns || returns.length !== expected.length || new Set(returns.map(r => r.itemId)).size !== returns.length)) throw new InventoryError("RETURNS_REQUIRED", "سجّل عدد القوارير الفارغة المستلمة لكل نوع.");
    if ((returns ?? []).some(r => !expected.some(e => e.itemId === r.itemId))) throw new InventoryError("INVALID_RETURNS", "نوع القارورة المستلمة لا يطابق الطلب.");
    const debtIds = [...new Set([...expected.map(r => r.itemId), ...previousReturns.map(r => r.itemId)])];
    if (debtIds.length && !context.customerId) throw new InventoryError("CUSTOMER_REQUIRED", "العميل غير محدد.");
    const debtReads = await Promise.all(debtIds.map(id => tx.get(db.collection(stockCollections.debts).doc(keyFor(`${context.customerId}:${id}`)))));
    const balances = new Map(debtIds.map((id, index) => [id, integer(debtReads[index].data()?.quantity ?? 0, "عهدة العميل")]));
    const oldBalances = new Map(balances);
    // Only debts that existed BEFORE this delivery can be settled here.
    // A shortage on this order can never authorize an extra return itself.
    for (const row of previousReturns) {
      const item = state.get(row.itemId)!;
      const oldDebt = oldBalances.get(row.itemId) ?? 0;
      if (item.kind !== "BOTTLE_POOL" || row.quantity > oldDebt) throw new InventoryError("STALE_BOTTLE_DEBT", "عدد القوارير السابقة أكبر من العهدة المتبقية. حدّث العهدة قبل اعتماد التسليم.");
      change(state, row.itemId, "owed", -row.quantity);
      change(state, row.itemId, "room", row.quantity);
      balances.set(row.itemId, oldDebt - row.quantity);
      recordedPrevious.push({ itemId: row.itemId, quantity: row.quantity, label: item.name });
    }
    for (const row of expected) {
      const received = integer(returns!.find(r => r.itemId === row.itemId)?.quantity, "القوارير المستلمة");
      if (received > row.quantity) throw new InventoryError("INVALID_RETURNS", "عدد الفارغ المستلم أكبر من قوارير الطلب. سجّل الزيادة ضمن قوارير من طلبات سابقة.");
      change(state, row.itemId, "out", -row.quantity);
      change(state, row.itemId, "room", received);
      const missing = row.quantity - received;
      if (missing) {
        if (!context.customerId) throw new InventoryError("CUSTOMER_REQUIRED", "العميل غير محدد.");
        change(state, row.itemId, "owed", missing);
        balances.set(row.itemId, (balances.get(row.itemId) ?? 0) + missing);
      }
    }
    for (const [itemId, quantity] of balances) if (quantity !== oldBalances.get(itemId) || previousReturns.some(r => r.itemId === itemId)) debts.push({ id: keyFor(`${context.customerId}:${itemId}`), quantity, item: state.get(itemId)! });
  }
  ensureAvailable(state);
  const write = writer(db, tx, state, before, action, context, { returns: returns ?? [], previousReturns: recordedPrevious });
  return { previousReturns: recordedPrevious, commit() {
    write();
    for (const debt of debts) tx.set(db.collection(stockCollections.debts).doc(debt.id), {
      customerId: context.customerId!, customerName: context.customerName ?? "", itemId: debt.item.id,
      itemName: debt.item.name, origin: debt.item.origin, quantity: integer(debt.quantity, "عهدة العميل"),
      updatedAt: Timestamp.now(), lastOrderId: context.orderId ?? "",
    }, { merge: true });
  } };
}
