import "server-only";
import { Timestamp, type DocumentData } from "firebase-admin/firestore";
import { z } from "zod";
import { getFirebaseAdminFirestore } from "@/lib/firebase/admin";
import { capacityMl, coolerType } from "./item-rules";
import { definitionKey } from "./admin-inventory";
import { InventoryError, assertItem, integer, keyFor, stockCollections as C } from "./stock-engine";
import type { CatalogEntry, CatalogSnapshot, CatalogType } from "@/types/catalog";
import type { StockItem, StockKind } from "@/types/inventory";

const id = z.string().regex(/^[A-Za-z0-9_-]{1,150}$/);
const optionalId = z.union([id, z.literal("")]);
const number = z.number().int().min(0).max(1_000_000_000);
const price = number.max(10_000_000);
const origin = z.enum(["JORDANIAN", "SAUDI", "DEFAULT"]);
const catalogType = z.enum(["CUPS", "SHRINK", "NEW_BOTTLE", "FILTER", "GOODS", "CONSUMABLE", "BOTTLE_POOL", "REFILL"]);
export const catalogCommandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("COOLER"), id, expectedVersion: number, expectedDefinitionVersion: number, storePriceFils: price, deliveryPriceFils: price, reason: z.string().trim().max(500).default("تحديث إعدادات الصنف") }).strict(),
  z.object({ action: z.literal("SAVE"), id: optionalId, legacyProductId: optionalId, expectedVersion: number, expectedDefinitionVersion: number,
    type: catalogType, name: z.string().trim().min(2).max(120), brand: z.string().trim().max(80), size: z.string().trim().max(80),
    baseUnit: z.string().trim().min(2).max(80), packLabel: z.string().trim().min(2).max(80), unitsPerPack: number.min(1).max(1_000_000), origin, lowStock: number,
    deliveryEnabled: z.boolean().optional(), publish: z.boolean(), showForEmployee: z.boolean(), showForCustomerApp: z.boolean(), cooled: z.boolean(),
    storePriceFils: price, deliveryPriceFils: price, cooledStorePriceFils: price, cooledDeliveryPriceFils: price,
    normalProductId: optionalId, cooledProductId: optionalId, requiresBottleOrigin: z.boolean(),
    pools: z.array(z.object({ origin, itemId: id, quantity: number.min(1).max(100) }).strict()).max(3), reason: z.string().trim().max(500).default("تحديث إعدادات الصنف"),
  }).strict(),
  z.object({ action: z.literal("RECIPE"), rows: z.array(z.object({ itemId: id, quantity: number.min(1).max(1000000) }).strict()).min(1).max(10), reason: z.string().trim().max(500).default("تحديث إعدادات الصنف") }).strict(),
  z.object({ action: z.enum(["DELETE", "ARCHIVE", "RESTORE"]), id: optionalId, legacyProductId: optionalId, expectedVersion: number, expectedDefinitionVersion: number, reason: z.string().trim().max(500).default("تحديث إعدادات الصنف") }).strict(),
]);
export const catalogRequestSchema = z.object({ requestId: z.string().uuid(), command: catalogCommandSchema }).strict();
export type CatalogCommand = z.infer<typeof catalogCommandSchema>;
type Save = Extract<CatalogCommand, { action: "SAVE" }>;
const stockKind = (type: CatalogType): StockKind => type === "CONSUMABLE" ? "CONSUMABLE" : type === "BOTTLE_POOL" ? "BOTTLE_POOL" : "GOODS";
const isGoods = (type: string) => ["CUPS", "SHRINK", "NEW_BOTTLE", "FILTER", "GOODS"].includes(type);
const category = (type: CatalogType) => type === "REFILL" ? "REFILL" : ["CUPS", "SHRINK", "NEW_BOTTLE"].includes(type) ? type : "OTHER";
const typeFrom = (item: StockItem | null, product?: DocumentData): CatalogType => item?.kind === "BOTTLE_POOL" ? "BOTTLE_POOL" : item?.kind === "CONSUMABLE" ? "CONSUMABLE" : product?.category === "REFILL" ? "REFILL" : ["CUPS", "SHRINK", "NEW_BOTTLE"].includes(product?.category) ? product!.category : "GOODS";
const physicalDefinition = (c: Save) => ({ name: c.name, brand: c.brand, size: c.size, kind: stockKind(c.type), baseUnit: c.baseUnit, packLabel: c.packLabel, unitsPerPack: c.unitsPerPack, origin: c.origin, lowStock: c.lowStock });

function view(id: string, record: DocumentData | undefined, item: StockItem | null, related: Array<{ id: string; name: string; location: string }>, products: Map<string, DocumentData>, policies: Map<string, DocumentData>, legacyProductId = ""): CatalogEntry {
  const normalId = record?.normalProductId ?? related.find(p => p.location === "ROOM")?.id ?? legacyProductId;
  const cooledId = record?.cooledProductId ?? related.find(p => p.location === "COOLER")?.id ?? "";
  const product = products.get(normalId), cold = products.get(cooledId), policy = policies.get(normalId);
  return { deliveryEnabled: record?.deliveryEnabled ?? product?.deliveryEnabled ?? true, id, legacyProductId, code: record?.code ?? item?.code ?? "يُرقّم عند الحفظ", type: record?.type ?? typeFrom(item, product),
    name: record?.name ?? item?.name ?? product?.name ?? "", brand: item?.brand ?? record?.brand ?? "", size: item?.size ?? record?.size ?? "",
    baseUnit: item?.baseUnit ?? record?.baseUnit ?? "قارورة", packLabel: item?.packLabel ?? record?.packLabel ?? "قارورة", unitsPerPack: item?.unitsPerPack ?? record?.unitsPerPack ?? 1,
    origin: item?.origin ?? record?.origin ?? "DEFAULT", lowStock: item?.lowStock ?? record?.lowStock ?? 0,
    version: record?.version ?? 0, definitionVersion: item?.definitionVersion ?? 0,
    publish: record?.publish ?? product?.isActive ?? false, showForEmployee: record?.showForEmployee ?? product?.showForEmployee ?? true, showForCustomerApp: record?.showForCustomerApp ?? product?.showForCustomerApp ?? false,
    cooled: record?.cooled ?? !!cold, storePriceFils: product?.storePriceFils ?? record?.storePriceFils ?? 0, deliveryPriceFils: product?.deliveryPriceFils ?? record?.deliveryPriceFils ?? 0,
    cooledStorePriceFils: cold?.storePriceFils ?? record?.cooledStorePriceFils ?? 0, cooledDeliveryPriceFils: cold?.deliveryPriceFils ?? record?.cooledDeliveryPriceFils ?? 0,
    normalProductId: normalId, cooledProductId: cooledId, requiresBottleOrigin: record?.requiresBottleOrigin ?? product?.requiresBottleOrigin ?? false,
    pools: (policy?.pools ?? record?.pools ?? []).map((p: { origin: string; itemId: string; quantity: number }) => ({ origin: p.origin, itemId: p.itemId, quantity: p.quantity })),
    ...(product?.category === "COOLED" && !item ? { legacyUnmappedCold: true } : {}),
    archived: record?.archived === true || item?.active === false || product?.isDeleted === true, legacy: !record, stock: item, related,
  };
}

export async function catalogSnapshot(): Promise<CatalogSnapshot> {
  const db = getFirebaseAdminFirestore();
  const [items, entries, products, policies, recipe] = await Promise.all([db.collection(C.items).get(), db.collection("catalogEntries").get(), db.collection("products").get(), db.collection(C.policies).get(), db.collection(C.settings).doc("refillRecipe").get()]);
  const productMap = new Map(products.docs.map(d => [d.id, d.data()]));
  const policyMap = new Map(policies.docs.map(d => [d.id, d.data()]));
  const entryMap = new Map(entries.docs.filter(d => !d.data().deleted).map(d => [d.id, d.data()]));
  const rows: CatalogEntry[] = [], represented = new Set<string>();
  const itemRows = items.docs.map(d => assertItem(d.data(), d.id));
  for (const item of itemRows) {
    const related = policies.docs.filter(d => d.data().mode === "STOCK" && d.data().itemId === item.id && productMap.has(d.id)).map(d => ({ id: d.id, name: productMap.get(d.id)!.name as string, location: d.data().location as string }));
    for (const r of related) represented.add(r.id);
    const master = entryMap.get(item.id);
    if (master?.deleted) continue;
    rows.push(view(item.id, master, item, related, productMap, policyMap));
  }
  for (const [id, entry] of entryMap) if (entry.type === "REFILL" || !itemRows.some(i => i.id === id)) { rows.push(view(id, entry, null, [], productMap, policyMap)); represented.add(entry.normalProductId); represented.add(entry.cooledProductId); }
  for (const [id, product] of productMap) if (!represented.has(id) && !(product.catalogEntryId && entryMap.has(product.catalogEntryId))) {
    // Unadopted old products are visible for one-time organization, never
    // duplicated or guessed into a stock item just by reading this endpoint.
    rows.push(view("", undefined, null, [], productMap, policyMap, id));
  }
  let recipeRows = recipe.data()?.rows;
  if (!recipeRows) {
    const candidate = [...policyMap.values()].find(p => p.mode === "REFILL" && p.consumables?.length);
    recipeRows = candidate?.consumables ?? [];
  }
  return { entries: rows.sort((a, b) => a.name.localeCompare(b.name, "ar")), items: itemRows.filter(i => !i.trashed), recipe: recipeRows.map((r: { itemId: string; quantity: number }) => ({ itemId: r.itemId, quantity: r.quantity })), recipeConfigured: recipe.exists };
}

export async function executeCatalog(request: z.infer<typeof catalogRequestSchema>, adminUid: string) {
  const db = getFirebaseAdminFirestore();
  const opId = keyFor(`catalog:${adminUid}:${request.requestId}`), opRef = db.collection(C.operations).doc(opId), fingerprint = keyFor(JSON.stringify(request.command));
  return db.runTransaction(async tx => {
    let c: CatalogCommand = request.command.action === "SAVE" ? { ...request.command, publish: isGoods(request.command.type) || request.command.type === "REFILL", showForEmployee: true, showForCustomerApp: false, requiresBottleOrigin: request.command.type === "REFILL", pools: [] } : request.command;
    const prior = await tx.get(opRef);
    if (prior.exists) { if (prior.data()?.fingerprint !== fingerprint) throw new InventoryError("REQUEST_REUSED", "رقم العملية مستخدم لبيانات مختلفة."); return { unchanged: true }; }
    const now = Timestamp.now();
    const finish = (details: Record<string, unknown> = {}) => { tx.create(opRef, { fingerprint, command: c, action: `CATALOG_${c.action}`, adminUid, createdAt: now }); tx.create(db.collection("catalogAudit").doc(opId), { action: c.action, adminUid, reason: c.reason, ...details, createdAt: now }); };
    const [itemsQ, policiesQ, productsQ, entriesQ, recipeDoc] = await Promise.all([tx.get(db.collection(C.items)), tx.get(db.collection(C.policies)), tx.get(db.collection("products")), tx.get(db.collection("catalogEntries")), tx.get(db.collection(C.settings).doc("refillRecipe"))]);
    const items = new Map(itemsQ.docs.map(d => [d.id, assertItem(d.data(), d.id)]));
    const policies = new Map(policiesQ.docs.map(d => [d.id, d.data()]));
    const products = new Map(productsQ.docs.map(d => [d.id, d.data()]));
    const entries = new Map(entriesQ.docs.map(d => [d.id, d.data()]));
    if (c.action === "COOLER") {
      const input = c, item = items.get(input.id), master = entries.get(input.id);
      if (!item || !item.active || item.trashed) throw new InventoryError("NOT_FOUND", "اختر صنفًا موجودًا بالمخزون.");
      const related = [...policies].filter(([, p]) => p.mode === "STOCK" && p.itemId === input.id).map(([id, p]) => ({ id, name: products.get(id)?.name ?? "", location: p.location }));
      const e = view(input.id, master, item, related, products, policies);
      if (!coolerType(e.type)) throw new InventoryError("NOT_COOLABLE", "الثلاجة مخصصة لكراتين الأكواب والشرنك؛ لا تُضاف القوارير أو الفلاتر أو مواد التشغيل.");
      c = { action: "SAVE", id: e.id, legacyProductId: "", expectedVersion: input.expectedVersion, expectedDefinitionVersion: input.expectedDefinitionVersion, type: e.type, name: e.name, brand: e.brand, size: e.size, baseUnit: e.baseUnit, packLabel: e.packLabel, unitsPerPack: e.unitsPerPack, origin: e.origin, lowStock: e.lowStock, publish: true, showForEmployee: true, showForCustomerApp: false, cooled: true, deliveryEnabled: e.deliveryEnabled !== false, storePriceFils: e.storePriceFils, deliveryPriceFils: e.deliveryPriceFils, cooledStorePriceFils: input.storePriceFils, cooledDeliveryPriceFils: input.deliveryPriceFils, normalProductId: e.normalProductId, cooledProductId: e.cooledProductId, requiresBottleOrigin: false, pools: [], reason: input.reason };
    }
    const checkRecipe = (rows: Array<{ itemId: string; quantity: number }>) => { if (!rows.length || new Set(rows.map(r => r.itemId)).size !== rows.length || rows.some(r => !items.get(r.itemId)?.active || items.get(r.itemId)?.kind !== "CONSUMABLE")) throw new InventoryError("RECIPE_REQUIRED", "جهّز مواد التعبئة مرة واحدة من زر «إعداد التعبئة»: الغطاء والختم والكيس وكمياتها."); };
    if (c.action === "RECIPE") {
      checkRecipe(c.rows);
      const targets = [...policies].filter(([productId, p]) => p.mode === "REFILL" && !products.get(productId)?.isDeleted);
      if (targets.length > 180) throw new InventoryError("TOO_MANY_SERVICES", "عدد خدمات التعبئة يحتاج تحديثًا مجزأ؛ لم يتم تغيير الوصفة.");
      tx.set(db.collection(C.settings).doc("refillRecipe"), { rows: c.rows, updatedAt: now, updatedBy: adminUid });
      for (const [productId] of targets) tx.update(db.collection(C.policies).doc(productId), { consumables: c.rows, updatedAt: now, updatedBy: adminUid });
      finish({ before: recipeDoc.data()?.rows ?? [], after: c.rows }); return {};
    }
    const sourceItem = c.id ? items.get(c.id) ?? null : null;
    const master = c.id ? entries.get(c.id) : undefined;
    const sourceProduct = c.legacyProductId ? products.get(c.legacyProductId) : undefined;
    if (c.id && (!sourceItem && !master || master?.deleted)) throw new InventoryError("NOT_FOUND", "الصنف غير موجود.");
    if (c.legacyProductId && (!sourceProduct || sourceProduct.isDeleted && c.action === "SAVE")) throw new InventoryError("NOT_FOUND", "منتج البيع القديم غير موجود.");
    if (sourceProduct?.catalogEntryId && sourceProduct.catalogEntryId !== c.id) throw new InventoryError("STALE_DEFINITION", "تم تنظيم المنتج في بطاقة أخرى؛ حدّث القائمة.");
    if ((master?.version ?? 0) !== c.expectedVersion || (sourceItem?.definitionVersion ?? 0) !== c.expectedDefinitionVersion) throw new InventoryError("STALE_DEFINITION", "تغيّرت البطاقة. حدّث الصفحة وأعد فتحها.");
    const related = [...policies].filter(([, p]) => sourceItem && p.mode === "STOCK" && p.itemId === sourceItem.id).map(([id]) => id);
    const saleIds = [...new Set([...related, master?.normalProductId, master?.cooledProductId, c.legacyProductId].filter((id): id is string => !!id))];
    if (c.action === "SAVE") { c = { ...c, deliveryEnabled: c.deliveryEnabled ?? master?.deliveryEnabled ?? sourceProduct?.deliveryEnabled ?? products.get(master?.normalProductId ?? related[0])?.deliveryEnabled ?? true }; c.requiresBottleOrigin = c.type === "REFILL" && c.deliveryEnabled !== false; }
    const oldServiceRef = master?.type === "REFILL" ? db.collection("catalogServiceKeys").doc(keyFor(master.name.normalize("NFKC").trim().toLocaleLowerCase("ar"))) : null;
    const oldServiceKey = oldServiceRef ? await tx.get(oldServiceRef) : null;
    const [history, pending] = await Promise.all([sourceItem ? tx.get(db.collection(C.movements).where("itemId", "==", sourceItem.id)) : null, tx.get(db.collection("deliveryOrders").where("status", "in", ["NEW", "READY"]))]);
    const isPending = pending.docs.some(d => { const o = d.data(); return (o.items ?? []).some((r: { productId: string }) => saleIds.includes(r.productId)) || sourceItem && [...(o.inventoryPlan?.allocations ?? []), ...(o.inventoryPlan?.consumables ?? [])].some((r: { itemId: string }) => r.itemId === sourceItem.id); });
    const obligations = sourceItem ? sourceItem.reservedRoom + sourceItem.reservedCooler + sourceItem.out + sourceItem.owed + sourceItem.review : 0;
    if (c.action !== "SAVE") {
      if (!c.id && !c.legacyProductId) throw new InventoryError("NOT_FOUND", "اختر الصنف.");
      if (c.action !== "RESTORE" && isPending) throw new InventoryError("ITEM_IN_USE", "على الصنف طلب أو حجز أو عهدة أو مراجعة. سوِّ الارتباط قبل حذفه أو أرشفته.");
      const dependency = sourceItem && [...policies].some(([pId, p]) => !saleIds.includes(pId) && p.mode === "REFILL" && [...(p.consumables ?? []), ...(p.pools ?? [])].some((r: { itemId: string }) => r.itemId === sourceItem.id));
      if (dependency && c.action === "ARCHIVE") throw new InventoryError("REFILL_DEPENDENCY", "الصنف مستخدم في إعداد التعبئة أو رصيد قوارير خدمة. اختر البديل من بطاقة الخدمة أو إعداد التعبئة أولًا.");
      if (c.action === "DELETE") {
        const entryId = c.id || c.legacyProductId;
        const oldSpec = sourceItem ? db.collection("inventoryUniqueKeys").doc(`spec_${sourceItem.identityKey}`) : null;

        const spec = oldSpec ? await tx.get(oldSpec) : null;
        if (spec?.exists && spec.data()?.itemId === sourceItem!.id) tx.delete(oldSpec!);

        if (oldServiceKey?.exists && oldServiceKey.data()?.entryId === c.id) tx.delete(oldServiceRef!);
        if (sourceItem) tx.update(db.collection(C.items).doc(sourceItem.id), { active: false, trashed: true, definitionVersion: (sourceItem.definitionVersion ?? 0) + 1, updatedAt: now });
        for (const id of saleIds) if (products.has(id)) tx.update(db.collection("products").doc(id), { isActive: false, isDeleted: true, catalogEntryId: entryId, showForCustomerApp: false, updatedAt: now });
        tx.set(db.collection("catalogEntries").doc(entryId), { ...(master ?? {}), id: entryId, type: master?.type ?? typeFrom(sourceItem, products.get(saleIds[0])), name: sourceItem?.name ?? master?.name ?? sourceProduct?.name ?? "", code: sourceItem?.code ?? master?.code ?? "", normalProductId: master?.normalProductId ?? saleIds.find(id => products.get(id)?.category !== "COOLED") ?? "", cooledProductId: master?.cooledProductId ?? saleIds.find(id => products.get(id)?.category === "COOLED") ?? "", publish: master?.publish ?? sourceProduct?.isActive ?? true, archived: true, trashed: true, deleted: false, version: (master?.version ?? 0) + 1, deletedAt: now }, { merge: true });
        finish({ before: { item: sourceItem, productIds: saleIds }, id: entryId }); return {};
      }
      const restore = c.action === "RESTORE";
      if (restore && sourceItem?.kind === "BOTTLE_POOL" && [...items.values()].some(item => item.id !== sourceItem.id && item.active && !item.trashed && item.kind === "BOTTLE_POOL" && item.origin === sourceItem.origin && (item.bottleSizeMl || capacityMl(item.size)) === (sourceItem.bottleSizeMl || capacityMl(sourceItem.size)))) throw new InventoryError("RESTORE_DUPLICATE", "يوجد رصيد قوارير آخر لنفس الحجم والنوع. احذف التعريف البديل قبل استعادة السابق.");
      const restoreSpec = restore && sourceItem ? db.collection("inventoryUniqueKeys").doc(`spec_${sourceItem.identityKey}`) : null;

      const restoreService = restore && master?.type === "REFILL" ? db.collection("catalogServiceKeys").doc(keyFor(master.name.normalize("NFKC").trim().toLocaleLowerCase("ar"))) : null;
      const locks = await Promise.all([restoreSpec ? tx.get(restoreSpec) : null, restoreService ? tx.get(restoreService) : null]);
      if (locks.some(d => d?.exists && (d.data()?.itemId ?? d.data()?.entryId) !== c.id)) throw new InventoryError("RESTORE_DUPLICATE", "تم تعريف نفس الصنف مجددًا. احذف التعريف الجديد قبل استعادة السابق.");
      if (restoreSpec) tx.set(restoreSpec, { itemId: c.id }); if (restoreService) tx.set(restoreService, { entryId: c.id });
      if (sourceItem) tx.update(db.collection(C.items).doc(sourceItem.id), { trashed: false, active: restore, archived: !restore, catalogManaged: true, definitionVersion: (sourceItem.definitionVersion ?? 0) + 1, updatedAt: now });
      for (const id of saleIds) if (restore && policies.get(id)?.mode === "REFILL") tx.update(db.collection(C.policies).doc(id), { consumables: recipeDoc.data()?.rows ?? [], updatedAt: now });
      for (const id of saleIds) if (products.has(id)) tx.update(db.collection("products").doc(id), { isActive: restore, showForCustomerApp: false, catalogArchivedPublish: restore ? (products.get(id)?.catalogArchivedPublish ?? false) : products.get(id)?.isActive ?? false, isDeleted: !restore, updatedAt: now, updatedByAuthUid: adminUid });
      // Legacy-only archival is represented on the product; adoption can occur
      // from the archived list later without allocating a second identifier.
      if (c.id) tx.set(db.collection("catalogEntries").doc(c.id), { ...(master ?? {}), id: c.id, type: master?.type ?? typeFrom(sourceItem, sourceProduct), name: sourceItem?.name ?? master?.name ?? sourceProduct?.name ?? "", code: sourceItem?.code ?? master?.code ?? "", publish: master?.publish ?? products.get(saleIds[0])?.isActive ?? false, normalProductId: master?.normalProductId ?? saleIds.find(id => products.get(id)?.category !== "COOLED") ?? "", cooledProductId: master?.cooledProductId ?? saleIds.find(id => products.get(id)?.category === "COOLED") ?? "", archived: !restore, trashed: false, version: (master?.version ?? 0) + 1, updatedAt: now }, { merge: true });
      finish({ id: c.id || c.legacyProductId, productIds: saleIds }); return {};
    }
    if (sourceProduct?.category === "COOLED" && !sourceItem) throw new InventoryError("LEGACY_COLD", "خيار المبرد القديم غير مربوط بصنف محدد. أنشئ خيار المبرد من بطاقة الصنف الأساسي، ثم احذف الخيار القديم بعد إغلاق طلباته.");
    if ((!isGoods(c.type) && c.cooled) || (["CONSUMABLE", "BOTTLE_POOL"].includes(c.type) && c.publish)) throw new InventoryError("INVALID_PUBLICATION", "المواد التشغيلية وقوارير التوزيع لا تُعرض كبضاعة للبيع أو كمبرد.");
    if (master?.archived || sourceItem && !sourceItem.active) throw new InventoryError("ARCHIVED", "استعد الصنف من المحذوفات قبل تعديله.");
    if ((master?.type === "REFILL" || sourceProduct?.category === "REFILL") && c.type !== "REFILL" || sourceItem && c.type === "REFILL") throw new InventoryError("SERVICE_KIND", "خدمة التعبئة والبضاعة بطاقتان مختلفتان. احذف تعريف التجربة وأضف النوع الصحيح.");
    const def = physicalDefinition(c), unitChanged = sourceItem && (sourceItem.baseUnit !== c.baseUnit || sourceItem.unitsPerPack !== c.unitsPerPack);
    const structural = sourceItem && (sourceItem.kind !== def.kind || sourceItem.origin !== c.origin || unitChanged);
    if (structural) {
      if (isPending || obligations) throw new InventoryError("ITEM_IN_USE", "لا يمكن تغيير الاستخدام أو الأصل أو الوحدة مع وجود طلب أو حجز أو عهدة.");
      const operational = new Set(["RESERVE", "DIRECT_SALE", "READY", "DELIVERED", "CANCELLED", "OPEN_DEBT", "RETURN_DEBT", "REVIEW_RETURN", "REVIEW_WASTE"]);
      if (history?.docs.some(d => operational.has(d.data().kind))) throw new InventoryError("HISTORY_LOCKED", "هذا تغيير لطبيعة صنف استُخدم فعليًا. احذف صنف التجربة من القائمة وأضف التعريف الصحيح؛ سجله السابق يبقى حتى التنظيف النهائي.");
      if (unitChanged && (history?.size || sourceItem.room + sourceItem.cooler > 0)) throw new InventoryError("UNIT_HISTORY_LOCKED", "لا يمكن إعادة تفسير وحدة الكميات المسجلة. اسم العبوة قابل للتعديل، أما الوحدة ومعاملها فيحتاجان تعريفًا صحيحًا مستقلًا بعد الاستخدام.");
      if (!isGoods(c.type) && sourceItem.cooler > 0) throw new InventoryError("COOLER_STOCK", "أعد الكمية من الثلاجة قبل تحويل الصنف لمواد تشغيلية أو قوارير توزيع.");
      if ([...policies].some(([id, p]) => !saleIds.includes(id) && p.mode === "REFILL" && [...(p.consumables ?? []), ...(p.pools ?? [])].some((r: { itemId: string }) => r.itemId === sourceItem.id))) throw new InventoryError("REFILL_DEPENDENCY", "هذا الصنف مستخدم في إعداد تعبئة أو قوارير خدمة؛ اختر البديل من الإعداد المركزي أو بطاقة الخدمة أولًا.");
    }
    if ((c.type === "REFILL" || c.type === "BOTTLE_POOL") && !capacityMl(c.size)) throw new InventoryError("BOTTLE_SIZE", "اكتب حجم القارورة بوضوح، مثل 10 لتر أو 20 لتر.");
    if (c.type === "BOTTLE_POOL") {
      const duplicatePool = [...items.values()].find(item => item.id !== c.id && !item.trashed && item.active && item.kind === "BOTTLE_POOL" && item.origin === c.origin && (item.bottleSizeMl || capacityMl(item.size)) === capacityMl(c.size));
      if (duplicatePool) throw new InventoryError("DUPLICATE_POOL", `قوارير التوصيل بهذا الحجم والنوع موجودة: «${duplicatePool.name}» (${duplicatePool.code}). استخدم توريد أو جرد لنفس التعريف.`);
    }
    if (c.type === "BOTTLE_POOL" && c.origin === "DEFAULT") throw new InventoryError("POOL_ORIGIN", "حدد نوع قوارير التوصيل المستعملة: أردني أو سعودي.");
    if (c.cooled && !coolerType(c.type)) throw new InventoryError("NOT_COOLABLE", "الثلاجة لكراتين الأكواب والشرنك المخصصين للتبريد؛ القوارير والفلاتر ومواد التشغيل لا تدخلها.");
    const entryId = c.id || (c.type === "REFILL" && c.legacyProductId ? c.legacyProductId : keyFor(`entry:${opId}`));
    const counterRef = db.collection(C.settings).doc("sequence");
    const counter = !sourceItem && !master?.code ? await tx.get(counterRef) : null;
    const sequence = counter ? integer((counter.data()?.last ?? 0) + 1, "رقم الصنف", 1) : 0;
    const code = sourceItem?.code || master?.code || `ITM-${String(sequence).padStart(6, "0")}`;
    const stockId = c.type === "REFILL" ? "" : sourceItem?.id ?? entryId;
    const identity = definitionKey(def), specRef = stockId ? db.collection("inventoryUniqueKeys").doc(`spec_${identity}`) : null;

    const oldSpecRef = sourceItem ? db.collection("inventoryUniqueKeys").doc(`spec_${sourceItem.identityKey}`) : null;

    const serviceRef = c.type === "REFILL" ? db.collection("catalogServiceKeys").doc(keyFor(c.name.normalize("NFKC").trim().toLocaleLowerCase("ar"))) : null;
    const [spec, oldSpec, serviceKey] = await Promise.all([specRef ? tx.get(specRef) : null, oldSpecRef ? tx.get(oldSpecRef) : null, serviceRef ? tx.get(serviceRef) : null]);
    for (const lock of [spec]) if (lock?.exists && lock.data()?.itemId !== stockId) { const d = items.get(lock.data()?.itemId); throw new InventoryError("DUPLICATE_ITEM", `الصنف موجود بالفعل: «${d?.name ?? "صنف آخر"}» (${d?.code ?? ""}). افتح بطاقته أو ورّده بدل إضافته مجددًا.`); }
    if (serviceKey?.exists && serviceKey.data()?.entryId !== entryId) throw new InventoryError("DUPLICATE_SERVICE", "خدمة التعبئة بهذا الاسم موجودة بالفعل.");
    const normals = saleIds.filter(id => policies.get(id)?.location !== "COOLER" && products.get(id)?.category !== "COOLED");
    const colds = saleIds.filter(id => policies.get(id)?.location === "COOLER" || products.get(id)?.category === "COOLED");
    if (isGoods(c.type) && normals.length > 1 && !c.normalProductId) throw new InventoryError("LEGACY_CHOICE", "اختر خيار البيع القديم الذي تريد الاحتفاظ به من البطاقة؛ توجد عدة خيارات قديمة مرتبطة بهذا الرصيد.");
    if (c.normalProductId && !saleIds.includes(c.normalProductId) && c.normalProductId !== stockId) throw new InventoryError("INVALID_PRODUCT_LINK", "خيار البيع المحدد لا يتبع هذه البطاقة.");
    if (c.cooledProductId && !saleIds.includes(c.cooledProductId) && c.cooledProductId !== `${stockId}_cold`) throw new InventoryError("INVALID_PRODUCT_LINK", "خيار المبرد المحدد لا يتبع هذه البطاقة.");
    const normalId = isGoods(c.type) || c.type === "REFILL" ? c.normalProductId || master?.normalProductId || normals[0] || entryId : "";
    const coldId = isGoods(c.type) && c.cooled ? c.cooledProductId || master?.cooledProductId || colds[0] || `${entryId}_cold` : "";
    const nextProducts = new Set([normalId, coldId].filter(Boolean));
    for (const id of nextProducts) if (products.has(id) && (!saleIds.includes(id) || products.get(id)?.catalogEntryId && products.get(id)?.catalogEntryId !== entryId)) throw new InventoryError("PRODUCT_OWNER", "خيار البيع يتبع بطاقة أخرى.");
    if (saleIds.some(id => !nextProducts.has(id)) && isPending) throw new InventoryError("PENDING_OPTIONS", "أغلق الطلبات المعلقة قبل إيقاف أحد خيارات البيع.");
    if (sourceItem && sourceItem.cooler > 0 && colds.length && !coldId) throw new InventoryError("COOLER_STOCK", "أعد الرصيد المبرد للمستودع قبل إيقاف خيار المبرد.");
    const preserve = sourceItem ?? { room: 0, cooler: 0, reservedRoom: 0, reservedCooler: 0, out: 0, owed: 0, review: 0 };
    // Writes begin only after every dependency, uniqueness and usage read.
    if (counter) tx.set(counterRef, { last: sequence });
    if (oldSpecRef && oldSpec?.exists && oldSpec.data()?.itemId === stockId && oldSpecRef.path !== specRef?.path) tx.delete(oldSpecRef);

    if (specRef) tx.set(specRef, { itemId: stockId });

    if (oldServiceKey?.exists && oldServiceKey.data()?.entryId === entryId && oldServiceRef?.path !== serviceRef?.path) tx.delete(oldServiceRef!);
    if (serviceRef) tx.set(serviceRef, { entryId });
    if (stockId) tx.set(db.collection(C.items).doc(stockId), { ...preserve, ...def, id: stockId, code, identityKey: identity, catalogManaged: true, catalogType: c.type, bottleSizeMl: capacityMl(c.size), archived: false, trashed: false, active: true, definitionVersion: (sourceItem?.definitionVersion ?? 0) + 1, updatedAt: now, updatedBy: adminUid, ...(sourceItem ? {} : { createdAt: now, createdBy: adminUid }) });
    for (const id of saleIds) if (!nextProducts.has(id) && products.has(id)) { tx.update(db.collection("products").doc(id), { isActive: false, isDeleted: true, catalogEntryId: entryId, updatedAt: now, updatedByAuthUid: adminUid }); tx.delete(db.collection(C.policies).doc(id)); }
    const writeProduct = (productId: string, cold: boolean) => {
      const previous = products.get(productId);
      tx.set(db.collection("products").doc(productId), { ...(previous ?? {}), name: cold ? `${c.name} — مبرد` : c.name, category: cold ? "COOLED" : category(c.type), bottleSizeMl: c.type === "REFILL" ? capacityMl(c.size) : 0, storePriceFils: cold ? c.cooledStorePriceFils : c.storePriceFils, deliveryPriceFils: cold ? c.cooledDeliveryPriceFils : c.deliveryPriceFils, isActive: c.publish, deliveryEnabled: c.deliveryEnabled !== false, showForEmployee: c.showForEmployee, showForCustomerApp: c.showForCustomerApp, requiresBottleOrigin: c.type === "REFILL" && c.deliveryEnabled !== false, imageUrl: previous?.imageUrl ?? null, isDeleted: false, deletedAt: null, deletedByAuthUid: null, catalogEntryId: entryId, updatedAt: now, updatedByAuthUid: adminUid, ...(previous ? {} : { createdAt: now, createdByAuthUid: adminUid }) });
      tx.set(db.collection(C.policies).doc(productId), { productId, mode: c.type === "REFILL" ? "REFILL" : "STOCK", deliveryEnabled: c.deliveryEnabled !== false, itemId: stockId, unitsPerSale: c.unitsPerPack, location: cold ? "COOLER" : "ROOM", reason: "ربط تلقائي من بطاقة الصنف", consumables: c.type === "REFILL" ? recipeDoc.data()?.rows ?? [] : [], pools: [], autoBottlePools: c.type === "REFILL", bottleSizeMl: c.type === "REFILL" ? capacityMl(c.size) : 0, updatedAt: now, updatedBy: adminUid });
    };
    if (normalId) writeProduct(normalId, false); if (coldId) writeProduct(coldId, true);
    const { action: _action, expectedVersion: _version, expectedDefinitionVersion: _definition, reason: _reason, ...entry } = c;
    void _action; void _version; void _definition; void _reason;
    tx.set(db.collection("catalogEntries").doc(entryId), { ...entry, id: entryId, code, normalProductId: normalId, cooledProductId: coldId, legacyProductId: "", archived: false, deleted: false, version: (master?.version ?? 0) + 1, updatedAt: now, updatedBy: adminUid });
    finish({ id: entryId, code, before: master ?? sourceItem ?? sourceProduct ?? null, normalProductId: normalId, cooledProductId: coldId }); return { id: entryId, code };
  });
}
