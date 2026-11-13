"use client";
import { userMessage } from "@/lib/client/user-message";
import { useTransientMessage } from "@/lib/client/use-transient-message";
import { useOperationChanges } from "@/lib/client/operation-changes";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import type { InventoryCommand } from "@/lib/inventory/admin-inventory";
import type { InventoryPolicy, StockItem } from "@/types/inventory";
import styles from "./inventory.module.css";
import { newRequestId } from "@/lib/client/request-id";
import { StockItemFields } from "@/components/admin/stock-item-fields";

export type Tab = "stock" | "pools" | "materials" | "cooler" | "debts" | "movements" | "settings";
type Product = { id: string; name: string; category: string; requiresBottleOrigin: boolean; active: boolean; storePriceFils: number; deliveryPriceFils: number };
type Debt = { id: string; customerId: string; customerName: string; itemId: string; itemName: string; quantity: number; updatedAt: string | null };
type Snapshot = { active: boolean; items: StockItem[]; products: Product[]; policies: InventoryPolicy[]; debts: Debt[] };
type Movement = { id: string; itemId: string; itemName: string; code: string; unit?: string; kind: string; changes: Record<string, number>; definitionBefore?: Record<string, string | number>; definitionAfter?: Record<string, string | number>; reason?: string; supplier?: string; totalCostFils?: number; customerName?: string; orderId?: string; actor?: { name: string }; createdAt: string | null };
type Dialog = { type: "ITEM" } | { type: "EDIT_ITEM"; item: StockItem } | { type: "MOVE"; item: StockItem; action: "RECEIVE" | "TRANSFER" | "ADJUST" | "WASTE" | "CONSUME" | "REVIEW_RETURN" | "REVIEW_WASTE" } | { type: "POLICY"; product: Product } | { type: "COLD"; product: Product } | { type: "DEBT"; debt: Debt } | { type: "DEBT_OPENING" };
const tabs: Array<[Tab, string]> = [["stock", "البضاعة"], ["pools", "قوارير التوصيل"], ["materials", "المواد التشغيلية"], ["cooler", "الثلاجة"], ["debts", "عهدة القوارير"], ["movements", "سجل الحركات"], ["settings", "ربط المنتجات والتشغيل"]];
const kindNames = { GOODS: "بضاعة للبيع", CONSUMABLE: "مادة تشغيلية", BOTTLE_POOL: "قوارير توزيع مستعملة" };
const movementNames: Record<string, string> = { RECEIVE: "توريد", TRANSFER: "نقل", ADJUST: "جرد / رصيد افتتاحي", WASTE: "تالف", CONSUME: "استهلاك يدوي", REVIEW_RETURN: "إعادة بعد المراجعة", REVIEW_WASTE: "تالف بعد المراجعة", RESERVE: "حجز طلب", DIRECT_SALE: "بيع مباشر", READY: "تجهيز وخروج", DELIVERED: "تسليم واستلام الفارغ", CANCELLED: "إلغاء طلب", RETURN_DEBT: "تسوية عهدة", OPEN_DEBT: "عهدة افتتاحية", EDIT_ITEM: "تعديل تعريف الصنف" };
const balanceNames: Record<string, string> = { room: "المستودع", cooler: "الثلاجة", reservedRoom: "حجز المستودع", reservedCooler: "حجز الثلاجة", out: "خارج للتوصيل", owed: "مستحق على العملاء", review: "بانتظار المراجعة" };
const sessionMessage = "انتهت جلسة الإدارة. سجّل الدخول ثم اضغط «التحقق من الدخول».";
const definitionLabels: Record<string, string> = { name: "الاسم", brand: "الشركة", size: "المواصفات", kind: "التصنيف", baseUnit: "وحدة العد", packLabel: "عبوة الشراء", unitsPerPack: "الوحدات داخل العبوة", origin: "أصل القارورة", lowStock: "حد التنبيه" };
function definitionValue(field: string, value: string | number | undefined) {
  if (field === "kind") return (kindNames as Record<string, string>)[String(value)] ?? String(value);
  if (field === "origin") return ({ JORDANIAN: "أردني", SAUDI: "سعودي", DEFAULT: "لا ينطبق / غير مفصول" } as Record<string, string>)[String(value)] ?? String(value);
  return value === undefined || value === "" ? "—" : String(value);
}
function quantity(item: StockItem, units: number) {
  if (item.unitsPerPack === 1) return `${units.toLocaleString("en-GB")} ${item.baseUnit}`;
  const packs = Math.floor(units / item.unitsPerPack), rest = units % item.unitsPerPack;
  return `${packs.toLocaleString("en-GB")} ${item.packLabel}${rest ? ` + ${rest} ${item.baseUnit}` : ""}`;
}
function date(value: string | null) { return value ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Amman", dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—"; }
function money(value: FormDataEntryValue | null) { const raw = String(value ?? "").trim(); if (!/^\d+(\.\d{1,3})?$/.test(raw)) throw Error("أدخل مبلغًا صحيحًا حتى ثلاث خانات عشرية."); return Math.round(Number(raw) * 1000); }

function OpeningDebtForm({ items, busy, onSave }: { items: StockItem[]; busy: boolean; onSave: (command: InventoryCommand) => Promise<void> }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);
  const [matches, setMatches] = useState<{ q: string; rows: Array<{ id: string; name: string; phone: string }>; error: boolean } | null>(null);
  useEffect(() => {
    if (selected || query.trim().length < 2) return;
    const controller = new AbortController(); let cancelled = false;
    const timer = window.setTimeout(async () => {
      try { const response = await fetch(`/api/admin/inventory?view=customers&q=${encodeURIComponent(query.trim())}`, { cache: "no-store", signal: controller.signal }); const result = await response.json(); if (!response.ok || !result.success) throw Error(); if (!cancelled) setMatches({ q: query, rows: result.data, error: false }); }
      catch { if (!cancelled) setMatches({ q: query, rows: [], error: true }); }
    }, 250);
    return () => { cancelled = true; controller.abort(); window.clearTimeout(timer); };
  }, [query, selected]);
  return <form className={styles.form} onSubmit={event => { event.preventDefault(); if (!selected) return; const form = new FormData(event.currentTarget); void onSave({ action: "OPEN_DEBT", customerId: selected.id, itemId: String(form.get("itemId")), quantity: Number(form.get("quantity")), reason: String(form.get("reason")) }); }}><fieldset disabled={busy}>

    {selected ? <div className={styles.productRow}><strong>{selected.name}</strong><button type="button" onClick={() => setSelected(null)}>تغيير العميل</button></div> : <><label>ابحث عن العميل<input value={query} onChange={event => setQuery(event.target.value)} placeholder="الاسم أو الهاتف"/></label>{matches?.q === query && (matches.error ? <p role="alert">تعذر البحث؛ أعد المحاولة.</p> : matches.rows.length ? matches.rows.map(customer => <button type="button" key={customer.id} onClick={() => setSelected(customer)}>{customer.name} — {customer.phone}</button>) : <p>لا يوجد عميل مطابق؛ أضفه من صفحة العملاء أولًا.</p>)}</>}
    <label>نوع القوارير المستحقة<select name="itemId" required><option value="">اختر الصنف</option>{items.filter(item => item.kind === "BOTTLE_POOL").map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <label>العدد<input name="quantity" type="number" min={1} max={1000000000} required lang="en-GB"/></label><input type="hidden" name="reason" value="تسجيل إجراء من الإدارة"/><label className={styles.check}><input type="checkbox" required/>هذه عهدة سابقة ولم تُسجَّل من طلب توصيل بالنظام.</label><button className={styles.primary} disabled={busy || !selected}>حفظ العهدة السابقة</button>
  </fieldset></form>;
}

function PolicyEditor({ product, items, initial, busy, onSave }: { product: Product; items: StockItem[]; initial?: InventoryPolicy; busy: boolean; onSave: (command: InventoryCommand) => Promise<void> }) {
  const origins = product.requiresBottleOrigin ? ["JORDANIAN", "SAUDI"] as const : ["DEFAULT"] as const;
  const [policy, setPolicy] = useState<InventoryPolicy>((initial ? { ...initial, pools: initial.mode === "REFILL" ? origins.map(origin => initial.pools.find(p => p.origin === origin) ?? { origin, itemId: "", quantity: 1 }) : initial.pools } : null) ?? { productId: product.id, mode: product.category === "REFILL" ? "REFILL" : "STOCK", itemId: "", unitsPerSale: 1, location: product.category === "COOLED" ? "COOLER" : "ROOM", reason: "", consumables: product.category === "REFILL" ? Array.from({ length: 3 }, () => ({ itemId: "", quantity: 1 })) : [], pools: product.category === "REFILL" ? (product.requiresBottleOrigin ? ["JORDANIAN", "SAUDI"] as const : ["DEFAULT"] as const).map(origin => ({ origin, itemId: "", quantity: 1 })) : [] });
  const choose = (kind: StockItem["kind"], origin?: string) => items.filter(i => i.active && i.kind === kind && (!origin || i.origin === origin));
  const options = (list: StockItem[]) => <><option value="">اختر الصنف</option>{list.map(i => <option value={i.id} key={i.id}>{i.code} — {i.name} ({i.baseUnit})</option>)}</>;
  return <form className={styles.form} onSubmit={event => { event.preventDefault(); void onSave({ action: "SET_POLICY", ...policy, reason:"تحديث ربط تتبع المنتج", ...(policy.mode === "EXEMPT" ? { itemId: "", consumables: [], pools: [] } : policy.mode === "STOCK" ? { consumables: [], pools: [] } : {}) }); }}>

    <label>طريقة التتبع<select value={policy.mode} onChange={e => { const mode = e.target.value as InventoryPolicy["mode"]; setPolicy({ ...policy, mode, ...(mode === "REFILL" ? { consumables: policy.consumables.length ? policy.consumables : Array.from({ length: 3 }, () => ({ itemId: "", quantity: 1 })), pools: origins.map(origin => policy.pools.find(p => p.origin === origin) ?? { origin, itemId: "", quantity: 1 }) } : {}) }); }}><option value={product.category === "REFILL" ? "REFILL" : "STOCK"}>{product.category === "REFILL" ? "تعبئة: مواد تشغيل وقوارير توزيع" : "خصم بضاعة من المخزون"}</option><option value="EXEMPT">استثناء صريح من تتبع المخزون</option></select></label>
    {policy.mode === "STOCK" && <><label>صنف المخزون<select required value={policy.itemId} onChange={e => setPolicy({ ...policy, itemId: e.target.value, unitsPerSale: items.find(item => item.id === e.target.value)?.unitsPerPack ?? 1 })}>{options(choose("GOODS"))}</select></label><div className={styles.formGrid}><label>عدد الوحدات الأساسية لكل وحدة بيع<input type="number" min={1} max={1000000} required value={policy.unitsPerSale} onChange={e => setPolicy({ ...policy, unitsPerSale: Number(e.target.value) })} lang="en-GB"/></label><label>مكان الخصم<select value={policy.location} onChange={e => setPolicy({ ...policy, location: e.target.value as InventoryPolicy["location"] })}><option value="ROOM">المستودع</option><option value="COOLER">الثلاجة</option></select></label></div></>}
    {policy.mode === "REFILL" && <><h3>مواد تُستهلك لكل قارورة معبأة</h3>{policy.consumables.map((row, index) => <div className={styles.recipe} key={index}><select aria-label={`المادة التشغيلية ${index + 1}`} required value={row.itemId} onChange={e => setPolicy({ ...policy, consumables: policy.consumables.map((r, n) => n === index ? { ...r, itemId: e.target.value } : r) })}>{options(choose("CONSUMABLE"))}</select><input aria-label={`كمية المادة ${index + 1}`} type="number" min={1} max={1000000} required value={row.quantity} onChange={e => setPolicy({ ...policy, consumables: policy.consumables.map((r, n) => n === index ? { ...r, quantity: Number(e.target.value) } : r) })} lang="en-GB"/><button type="button" disabled={busy} onClick={() => setPolicy({ ...policy, consumables: policy.consumables.filter((_, n) => n !== index) })}>حذف</button></div>)}<button type="button" disabled={busy || policy.consumables.length >= 10} onClick={() => setPolicy({ ...policy, consumables: [...policy.consumables, { itemId: "", quantity: 1 }] })}>+ مادة تشغيلية</button><h3>رصيد القوارير المستخدمة للتوصيل</h3>{policy.pools.map((row, index) => <label key={row.origin}>{row.origin === "JORDANIAN" ? "أردني" : row.origin === "SAUDI" ? "سعودي" : "قوارير هذا الحجم"}<select required value={row.itemId} onChange={e => setPolicy({ ...policy, pools: policy.pools.map((r, n) => n === index ? { ...r, itemId: e.target.value } : r) })}>{options(choose("BOTTLE_POOL", row.origin))}</select></label>)}</>}

    <button className={styles.primary} disabled={busy}>{busy ? "جارٍ الحفظ…" : "حفظ الربط"}</button>
  </form>;
}

export default function InventoryManager({ initialTab = "stock", customerId }: { initialTab?: Tab; customerId?: string }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [data, setData] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useTransientMessage(notice, setNotice);
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [ledger, setLedger] = useState<Movement[]>([]);
  const [ledgerCursor, setLedgerCursor] = useState<string | null>(null);
  const [ledgerLoaded, setLedgerLoaded] = useState(false);
  const [sessionRequired, setSessionRequired] = useState(false);
  const [checkingSession, setCheckingSession] = useState(false);
  const requestRef = useRef<{ fingerprint: string; requestId: string } | null>(null);
  const lock = useRef(false);
  const modalRef = useRef<HTMLElement>(null);
  const refreshSequence=useRef(0);
  const refreshController=useRef<AbortController|null>(null);
  useEffect(() => {
    if (!dialog) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const modal = modalRef.current;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    (modal?.querySelector<HTMLElement>("input, select, textarea, button") ?? modal)?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !lock.current) { event.preventDefault(); setDialog(null); }
      if (event.key !== "Tab" || !modal) return;
      const elements = [...modal.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex="0"]')].filter(el => !el.matches(":disabled") && el.offsetParent !== null);
      const first = elements[0], last = elements.at(-1);
      if (!first) { event.preventDefault(); modal.focus(); }
      else if (event.shiftKey && (document.activeElement === first || document.activeElement === modal)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", keyboard);
    return () => { document.removeEventListener("keydown", keyboard); document.body.style.overflow = overflow; previous?.focus(); };
  }, [dialog]);
  const readResult = useCallback(async (response: Response) => {
    const payload = await response.json();
    if (response.status === 401) { setSessionRequired(true); throw Error(sessionMessage); }
    if (response.ok && payload.success) setSessionRequired(false);
    return payload;
  }, []);
  const refresh = useCallback(async (quiet=false) => {
    if(quiet&&refreshController.current)return;
    const sequence=++refreshSequence.current;refreshController.current?.abort();
    const controller=new AbortController();refreshController.current=controller;
    if(!quiet)setLoading(true);
    try{const response=await fetch("/api/admin/inventory",{cache:"no-store",signal:controller.signal});if(controller.signal.aborted||sequence!==refreshSequence.current)return;const result=await readResult(response);if(!response.ok||!result.success)throw Error(result.error?.message??"تعذر تحميل المخزون.");if(sequence===refreshSequence.current&&!controller.signal.aborted){setData(result.data);setError("");}}
    catch(cause){if(!controller.signal.aborted&&sequence===refreshSequence.current)setError(userMessage(cause instanceof Error?cause.message:"تعذر الاتصال."));}
    finally{if(sequence===refreshSequence.current){refreshController.current=null;setLoading(false);}}
  },[readResult]);
  useEffect(()=>{const timer=window.setTimeout(()=>void refresh(),0);return()=>{window.clearTimeout(timer);refreshController.current?.abort();};},[refresh]);
  useOperationChanges(["inventory", "catalog", "orders"], () => { if (!lock.current) void refresh(true); }, !dialog && !busy && !sessionRequired);
  async function save(command: InventoryCommand) {
    if (sessionRequired) { setError(userMessage(sessionMessage)); return; }
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(""); setNotice("");
    const fingerprint = JSON.stringify(command);
    try {
      if (!requestRef.current || requestRef.current.fingerprint !== fingerprint) requestRef.current = { fingerprint, requestId: newRequestId() };
      const response = await fetch("/api/admin/inventory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: requestRef.current.requestId, command }) });
      const result = await readResult(response); if (!response.ok || !result.success) throw Error(result.error?.message ?? "تعذر حفظ الحركة.");
      requestRef.current = null; setDialog(null); setNotice("تم الحفظ."); setLedgerLoaded(false); setLedger([]); setLedgerCursor(null); await refresh();
    } catch (cause) { setError(userMessage(cause instanceof Error ? cause.message : "تعذر الاتصال. أعد المحاولة بنفس البيانات.")); }
    finally { lock.current = false; setBusy(false); }
  }
  async function loadLedger(append = false) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const response = await fetch(`/api/admin/inventory?view=movements${append && ledgerCursor ? `&cursor=${ledgerCursor}` : ""}`, { cache: "no-store" });
      const result = await readResult(response); if (!response.ok || !result.success) throw Error(result.error?.message ?? "تعذر تحميل السجل.");
      setLedger(old => append ? [...old, ...result.data.rows] : result.data.rows); setLedgerCursor(result.data.nextCursor); setLedgerLoaded(true);
    } catch (cause) { setError(userMessage(cause instanceof Error ? cause.message : "تعذر تحميل السجل.")); }
    finally { lock.current = false; setBusy(false); }
  }
  function open(value: Dialog) { setDialog(value); setError(""); setNotice(""); requestRef.current = null; }
  async function verifySession() {
    if (checkingSession) return;
    setCheckingSession(true);
    try {
      const response = await fetch("/api/auth/session/admin/verify", { cache: "no-store", credentials: "same-origin" });
      const result = await readResult(response);
      if (!response.ok || !result.success) throw Error("أكمل تسجيل دخول الإدارة ثم تحقق مجددًا.");
      setSessionRequired(false); setError(""); setNotice("تم تسجيل الدخول.");
    } catch (cause) { setError(userMessage(cause instanceof Error ? cause.message : "تعذر التحقق من الدخول. تحقق من الاتصال.")); }
    finally { setCheckingSession(false); }
  }
  const sessionPrompt = sessionRequired ? <div className={styles.banner} role="alert"><div><strong>{error || "انتهت جلسة الإدارة. سجّل الدخول للمتابعة."}</strong></div><div className={styles.buttons}><a href="/" target="_blank" rel="noopener noreferrer">فتح الدخول في تبويب آخر ↗</a><button type="button" disabled={checkingSession} onClick={() => void verifySession()}>{checkingSession ? "جارٍ التحقق…" : "التحقق من الدخول"}</button></div></div> : null;
  const items = useMemo(() => (data?.items ?? []).filter(item => (tab === "materials" ? item.kind === "CONSUMABLE" : tab === "pools" ? item.kind === "BOTTLE_POOL" : item.kind === "GOODS") && `${item.name} ${item.brand} ${item.size} ${item.code}`.toLocaleLowerCase("ar").includes(search.trim().toLocaleLowerCase("ar"))), [data, tab, search]);
  const debts = (data?.debts ?? []).filter(d => (!customerId || d.customerId === customerId) && `${d.customerName} ${d.itemName}`.includes(search.trim()));
  const available = (item: StockItem) => item.room + item.cooler - item.reservedRoom - item.reservedCooler;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!dialog || !data) return;
    const form = new FormData(event.currentTarget);
    const t = (key: string) => String(form.get(key) ?? "").trim();
    const n = (key: string) => Number(t(key));
    try {
      if (dialog.type === "ITEM" || dialog.type === "EDIT_ITEM") {
        const definition = { name: t("name"), brand: t("brand"), size: t("size"), kind: t("kind") as StockItem["kind"], baseUnit: t("baseUnit"), packLabel: t("packLabel"), unitsPerPack: n("unitsPerPack"), origin: t("origin") as StockItem["origin"], lowStock: n("lowStock") };
        if (dialog.type === "EDIT_ITEM") void save({ action: "EDIT_ITEM", ...definition, itemId: dialog.item.id, expectedDefinitionVersion: dialog.item.definitionVersion ?? 0, reason: t("reason") });
        else void save({ action: "CREATE_ITEM", ...definition });
      }
      if (dialog.type === "MOVE") {
        const { item, action } = dialog;
        const unit = t("unit") as "PACK" | "BASE";
        if (action === "TRANSFER") void save({ action, itemId: item.id, quantity: n("quantity"), unit, to: t("location") as "ROOM" | "COOLER", reason: t("reason") });
        else void save({ action, itemId: item.id, quantity: n("quantity"), unit, location: t("location") as "ROOM" | "COOLER", reason: t("reason"), supplier: t("supplier"), totalCostFils: action === "RECEIVE" ? money(form.get("totalCost")) : 0, ...(action === "ADJUST" ? { expectedBalance: { room: item.room, cooler: item.cooler, reservedRoom: item.reservedRoom, reservedCooler: item.reservedCooler } } : {}) });
      }
      if (dialog.type === "COLD") void save({ action: "CREATE_COOLED", productId: dialog.product.id, storePriceFils: money(form.get("storePrice")), deliveryPriceFils: money(form.get("deliveryPrice")) });
      if (dialog.type === "DEBT") void save({ action: "RETURN_DEBT", debtId: dialog.debt.id, quantity: n("quantity"), reason: t("reason"), disposition: t("disposition") as "RETURNED" | "LOST" });
    } catch (cause) { setError(userMessage(cause instanceof Error ? cause.message : "تحقق من الحقول.")); }
  }
  return <main className={styles.page} dir="rtl">
    <header className={styles.header}><div><span className={styles.eyebrow}>الإدارة / البضاعة والتشغيل</span><h1>{tab === "stock" ? "المخزون" : tabs.find(t => t[0] === tab)?.[1]}</h1></div><div className={styles.buttons}><button type="button" onClick={() => void refresh()} disabled={busy || loading}>تحديث</button><Link className={styles.primary} href="/admin/pricing">+ إضافة صنف</Link><Link href="/admin/pricing">الأصناف والأسعار ←</Link></div></header>
    {!dialog && <>{sessionPrompt}{error && !sessionRequired && <div className={styles.error} role="alert">{error}</div>}</>}{notice && <div className={styles.notice} role="status">{notice}</div>}
    <nav className={styles.tabs} aria-label="أقسام المخزون">{tabs.filter(([value]) => value !== "settings" && (initialTab === "cooler" ? value === "cooler" : value !== "cooler")).map(([value, label]) => <button type="button" key={value} aria-pressed={tab === value} onClick={() => { setTab(value); setSearch(""); if (value === "movements" && !ledgerLoaded) void loadLedger(); }}>{label}</button>)}</nav>
    <section className={styles.stats}><div><span>الأصناف في هذا القسم</span><strong>{items.length}</strong></div><div><span>تحت حد التنبيه</span><strong>{items.filter(i => i.active && available(i) <= i.lowStock).length}</strong></div></section>
    <div className={styles.search}><input type="search" aria-label="البحث" value={search} onChange={e => setSearch(e.target.value)} placeholder="ابحث بالاسم أو الشركة أو رقم الصنف…"/>{loading && <span>جارٍ التحديث…</span>}</div>
    {data && ["stock", "pools", "materials"].includes(tab) && <>


      <div className={styles.tableWrap}><table><thead><tr><th>الصنف</th><th>{tab === "pools" ? "داخل المحل" : "الرصيد الإجمالي"}</th><th>المحجوز</th><th>المتاح</th>{tab === "pools" && <><th>خارج للتوصيل</th><th>عهدة العملاء</th></>}<th>الإجراءات</th></tr></thead><tbody>{items.map(item => <tr key={item.id}><td><strong>{item.name}</strong><small>{item.code} · {[item.brand, item.size].filter(Boolean).join(" — ")}</small><small>{item.packLabel} = {item.unitsPerPack} {item.baseUnit}</small>{item.review > 0 && <small className={styles.warning}>مرتجع طلب ملغى: {quantity(item, item.review)}</small>}</td><td>{quantity(item, item.room + item.cooler)}{item.cooler > 0 && <small>منها بالثلاجة: {quantity(item, item.cooler)}</small>}</td><td>{quantity(item, item.reservedRoom + item.reservedCooler)}</td><td><b className={available(item) <= item.lowStock ? styles.warning : ""}>{quantity(item, available(item))}</b></td>{tab === "pools" && <><td>{quantity(item, item.out)}</td><td>{quantity(item, item.owed)}</td></>}<td><div className={styles.rowActions}><Link href={`/admin/pricing?item=${encodeURIComponent(item.id)}`}>تعديل / حذف</Link>{(["RECEIVE", "ADJUST", ...(item.kind === "BOTTLE_POOL" ? ["WASTE"] : []), ...(item.kind === "CONSUMABLE" ? ["CONSUME"] : []), ...(item.review > 0 ? ["REVIEW_RETURN", ...(item.kind === "BOTTLE_POOL" ? ["REVIEW_WASTE"] : [])] : [])] as Array<Extract<Dialog, { type: "MOVE" }>["action"]>).map(action => <button key={action} disabled={busy} type="button" onClick={() => open({ type: "MOVE", item, action })}>{movementNames[action]}</button>)}</div></td></tr>)}</tbody></table>{!items.length && <p className={styles.empty}>لا توجد أصناف في هذا القسم.</p>}</div>
    </>}
    {data && tab === "settings" && <section className={styles.panel}><h2>ربط أصناف البيع بالمخزون</h2>{data.products.filter(p => p.name.includes(search)).map(product => { const policy = data.policies.find(p => p.productId === product.id); return <div className={styles.productRow} key={product.id}><div><strong>{product.name}{!product.active ? " — موقوف" : ""}</strong><small>{!policy ? "غير مربوط" : policy.mode === "STOCK" ? `${data.items.find(i => i.id === policy.itemId)?.name ?? "صنف مفقود"} — ${policy.location === "COOLER" ? "الثلاجة" : "المستودع"} — ${policy.unitsPerSale} وحدة لكل بيع` : policy.mode === "REFILL" ? `تعبئة: ${policy.consumables.length} مواد تشغيلية` : `استثناء: ${policy.reason}`}</small></div><div className={styles.buttons}><button type="button" disabled={busy} onClick={() => open({ type: "POLICY", product })}>{policy ? "تعديل الربط" : "ربط المنتج"}</button>{policy?.mode === "STOCK" && policy.location === "ROOM" && <button type="button" disabled={busy} onClick={() => open({ type: "COLD", product })}>إنشاء نسخة مبردة</button>}</div></div>; })}</section>}
    {data && tab === "debts" && <section className={styles.panel}><div className={styles.buttons}><h2>قوارير مستحقة على العملاء</h2><button type="button" disabled={busy} onClick={() => open({ type: "DEBT_OPENING" })}>+ ترحيل عهدة سابقة من الورق</button></div>{debts.map(debt => <div className={styles.productRow} key={debt.id}><div><Link href={`/admin/customers/${encodeURIComponent(debt.customerId)}`}>{debt.customerName || debt.customerId}</Link><strong>{debt.quantity} — {debt.itemName}</strong><small>آخر حركة: {date(debt.updatedAt)}</small></div><button type="button" disabled={busy} onClick={() => open({ type: "DEBT", debt })}>استلام / تسوية</button></div>)}{!debts.length && <p className={styles.empty}>لا توجد عهد قوارير مطابقة.</p>}</section>}
    {tab === "movements" && <section className={styles.panel}><div className={styles.buttons}><h2>سجل حركات المخزون</h2><button type="button" disabled={busy} onClick={() => void loadLedger()}>تحديث السجل</button></div>{ledger.filter(row => `${row.itemName} ${row.code} ${row.customerName ?? ""}`.includes(search)).map(row => <article className={styles.movement} key={row.id}><div><strong>{movementNames[row.kind] ?? row.kind} — {row.itemName}</strong><small>{date(row.createdAt)} · {row.actor?.name ?? "الإدارة"} · {row.code}</small>{row.orderId && <small>الطلب: {row.orderId}</small>}</div>{row.kind === "EDIT_ITEM" && row.definitionBefore && row.definitionAfter && <div className={styles.changes}>{Object.keys(definitionLabels).filter(field => row.definitionBefore![field] !== row.definitionAfter![field]).map(field => <span key={field}>{definitionLabels[field]}: {definitionValue(field, row.definitionBefore![field])} ← {definitionValue(field, row.definitionAfter![field])}</span>)}</div>}<div className={styles.changes}>{Object.entries(row.changes).filter(([, q]) => q !== 0).map(([key, q]) => <span key={key}>{balanceNames[key] ?? key}: {q > 0 ? "+" : ""}{q} {row.unit ?? "وحدة أساسية"}</span>)}</div>{row.reason && <p>{row.reason}</p>}{row.customerName && <p>العميل: {row.customerName}</p>}{row.supplier && <p>المورد: {row.supplier}</p>}{typeof row.totalCostFils === "number" && row.totalCostFils > 0 && <p>تكلفة التوريد: {(row.totalCostFils / 1000).toFixed(3)} د.أ</p>}</article>)}{ledgerCursor && <button type="button" disabled={busy} onClick={() => void loadLedger(true)}>تحميل حركات أقدم</button>}{ledgerLoaded && !ledger.length && <p className={styles.empty}>لا توجد حركات بعد.</p>}</section>}
    {dialog && data && <div className={styles.overlay} role="presentation" onMouseDown={e => { if (e.target === e.currentTarget && !busy) setDialog(null); }}><section ref={modalRef} tabIndex={-1} className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="inventory-dialog-title"><div className={styles.modalHeader}><h2 id="inventory-dialog-title">{dialog.type === "ITEM" ? "تعريف صنف جديد" : dialog.type === "EDIT_ITEM" ? `تعديل تعريف — ${dialog.item.code}` : dialog.type === "MOVE" ? `${movementNames[dialog.action]} — ${dialog.item.name}` : dialog.type === "POLICY" ? "ربط المنتج بالمخزون" : dialog.type === "COLD" ? "نسخة بيع مبردة" : dialog.type === "DEBT" ? "تسوية عهدة قوارير" : dialog.type === "DEBT_OPENING" ? "إدخال عهدة سابقة" : "إدخال عهدة سابقة"}</h2><button type="button" aria-label="إغلاق" disabled={busy} onClick={() => setDialog(null)}>×</button></div>
      {sessionPrompt}
      {error && !sessionRequired && <div className={styles.error} role="alert">{error}</div>}
      {dialog.type === "DEBT_OPENING" ? <OpeningDebtForm items={data.items} busy={busy} onSave={save}/> : dialog.type === "POLICY" ? <PolicyEditor key={dialog.product.id} product={dialog.product} items={data.items} initial={data.policies.find(p => p.productId === dialog.product.id)} busy={busy} onSave={save}/> : <form className={styles.form} onSubmit={submit}><fieldset disabled={busy || sessionRequired}>
        {(dialog.type === "ITEM" || dialog.type === "EDIT_ITEM") && <StockItemFields item={dialog.type === "EDIT_ITEM" ? dialog.item : undefined} defaultKind={tab === "materials" ? "CONSUMABLE" : "GOODS"} gridClassName={styles.formGrid}/>}
        {dialog.type === "MOVE" && <><p className={styles.hint}>المستودع: {quantity(dialog.item, dialog.item.room)} · الثلاجة: {quantity(dialog.item, dialog.item.cooler)} · المراجعة: {quantity(dialog.item, dialog.item.review)}</p><div className={styles.formGrid}><label>{dialog.action === "ADJUST" ? "الكمية الفعلية النهائية" : "الكمية"}<input name="quantity" type="number" required min={dialog.action === "ADJUST" ? 0 : 1} max={1000000000} step={1} lang="en-GB"/></label><label>وحدة الإدخال<select name="unit"><option value="PACK">{dialog.item.packLabel} ({dialog.item.unitsPerPack} {dialog.item.baseUnit})</option><option value="BASE">{dialog.item.baseUnit}</option></select></label><label>{dialog.action === "TRANSFER" ? "النقل إلى" : "المكان"}<select name="location" defaultValue={tab === "cooler" ? "COOLER" : "ROOM"}><option value="ROOM">المستودع</option>{dialog.item.kind === "GOODS" && dialog.action !== "RECEIVE" && dialog.action !== "WASTE" && <option value="COOLER">الثلاجة</option>}</select></label>{dialog.action === "RECEIVE" && <><label>المورد<input name="supplier" maxLength={160}/></label><label>إجمالي تكلفة هذه الدفعة بالدينار<input name="totalCost" inputMode="decimal" pattern="[0-9]+([.][0-9]{1,3})?" defaultValue="0" required/></label></>}</div>{dialog.action === "REVIEW_WASTE" && <p className={styles.warning}>هذه الكمية لن تعود إلى الرصيد القابل للبيع.</p>}<input type="hidden" name="reason" value="تسجيل إجراء من الإدارة"/></>}
        {dialog.type === "COLD" && <><label>سعر المبرد داخل المحل بالدينار<input name="storePrice" required inputMode="decimal" pattern="[0-9]+([.][0-9]{1,3})?"/></label><label>سعر المبرد للتوصيل بالدينار<input name="deliveryPrice" required inputMode="decimal" pattern="[0-9]+([.][0-9]{1,3})?"/></label></>}
        {dialog.type === "DEBT" && <><p>{dialog.debt.customerName} — {dialog.debt.itemName} — المتبقي {dialog.debt.quantity}</p><label>العدد<input name="quantity" required type="number" min={1} max={dialog.debt.quantity} lang="en-GB"/></label><label>نوع التسوية<select name="disposition"><option value="RETURNED">استلمنا القوارير — تعود للمخزون</option><option value="LOST">فقدان / تلف معتمد — لا تعود للمخزون</option></select></label><input type="hidden" name="reason" value="تسجيل إجراء من الإدارة"/></>}
        <div className={styles.buttons}><button className={styles.primary} disabled={busy}>{busy ? "جارٍ الحفظ…" : "اعتماد وحفظ"}</button><button type="button" disabled={busy} onClick={() => setDialog(null)}>رجوع</button></div>
      </fieldset></form>}
    </section></div>}
  </main>;
}
