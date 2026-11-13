"use client";
import { userMessage } from "@/lib/client/user-message";
import { useTransientMessage } from "@/lib/client/use-transient-message";
import { useOperationChanges } from "@/lib/client/operation-changes";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import type { CatalogEntry, CatalogSnapshot } from "@/types/catalog";
import { coolerType } from "@/lib/inventory/item-rules";
import { newRequestId } from "@/lib/client/request-id";
import styles from "../inventory/inventory.module.css";
type Dialog = { action: "ADD" | "TRANSFER" | "RETURN"; id: string };
const packs = (entry: CatalogEntry, amount: number) => `${Math.floor(amount / entry.unitsPerPack)} ${entry.packLabel}${amount % entry.unitsPerPack ? ` و${amount % entry.unitsPerPack} ${entry.baseUnit}` : ""}`;
function price(value: FormDataEntryValue | null) { const raw = String(value ?? ""); if (!/^\d+(\.\d{1,3})?$/.test(raw)) throw Error("أدخل السعر بالدينار حتى ثلاث خانات عشرية."); return Math.round(Number(raw) * 1000); }
export default function CoolerManager() {
  const [data, setData] = useState<CatalogSnapshot | null>(null), [dialog, setDialog] = useState<Dialog | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState(""), [session, setSession] = useState(false);
  useTransientMessage(notice, setNotice);
  const pending = useRef<{ body: string; id: string } | null>(null), modal = useRef<HTMLElement>(null), locked = useRef(false);
  async function read(response: Response) { const result = await response.json(); if (response.status === 401) { setSession(true); throw Error("انتهت جلسة الإدارة. سجّل الدخول ثم تحقق مجددًا."); } if (!response.ok || !result.success) throw Error(result.error?.message ?? "تعذر إتمام العملية."); return result.data; }
  async function refresh() { setData(await read(await fetch("/api/admin/catalog", { cache: "no-store" }))); }
  useEffect(() => { let alive = true; fetch("/api/admin/catalog", { cache: "no-store" }).then(read).then(d => { if (alive) setData(d); }).catch(e => { if (alive) setError(userMessage(e.message)); }); return () => { alive = false; }; }, []);
  useEffect(() => {
    if (!dialog) return;
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null, overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden"; modal.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !locked.current) setDialog(null);
      if (event.key !== "Tab") return;
      const nodes = [...(modal.current?.querySelectorAll<HTMLElement>('input,select,button,a[href]') ?? [])].filter(n => !n.matches(":disabled") && n.offsetParent !== null);
      if (event.shiftKey && (document.activeElement === nodes[0] || document.activeElement === modal.current)) { event.preventDefault(); nodes.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === nodes.at(-1)) { event.preventDefault(); nodes[0]?.focus(); }
    };
    document.addEventListener("keydown", key); return () => { document.body.style.overflow = overflow; document.removeEventListener("keydown", key); before?.focus(); };
  }, [dialog]);
  function open(action: Dialog["action"], id = "") { pending.current = null; setError(""); setNotice(""); setDialog({ action, id }); }
  const current = data?.entries.filter(e => !e.archived && e.stock) ?? [], eligible = current.filter(e => coolerType(e.type)), enrolled = eligible.filter(e => e.cooled);
  const misplaced = current.filter(e => !coolerType(e.type) && e.stock!.cooler > 0);
  const choices = dialog?.action === "ADD" ? eligible.filter(e => !e.cooled) : dialog?.action === "RETURN" ? current.filter(e => e.stock!.cooler > e.stock!.reservedCooler) : enrolled;
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (locked.current || session || !dialog) return;
    try {
      const fields = new FormData(event.currentTarget), entry = current.find(e => e.id === String(fields.get("item")));
      if (!entry) throw Error("اختر الصنف.");
      const command = dialog.action === "ADD" ? { action: "COOLER", id: entry.id, expectedVersion: entry.version, expectedDefinitionVersion: entry.definitionVersion, storePriceFils: price(fields.get("store")), deliveryPriceFils: price(fields.get("delivery")), reason: "إضافة صنف مناسب للثلاجة" } : { action: "TRANSFER", itemId: entry.id, quantity: Number(fields.get("quantity")), unit: "PACK", to: dialog.action === "RETURN" ? "ROOM" : "COOLER", reason: dialog.action === "RETURN" ? "إرجاع من الثلاجة للمحل" : "نقل من المحل للثلاجة" };
      const body = JSON.stringify(command); if (pending.current?.body !== body) pending.current = { body, id: newRequestId() };
      locked.current = true; setBusy(true); setError("");
      await read(await fetch(dialog.action === "ADD" ? "/api/admin/catalog" : "/api/admin/inventory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ command, requestId: pending.current.id }) }));
      setDialog(null); pending.current = null; setNotice(dialog.action === "ADD" ? "أُضيف الصنف للثلاجة." : "تم النقل بنجاح."); await refresh();
    } catch (e) { setError(userMessage(e instanceof Error ? e.message : "تعذر الحفظ.")); } finally { locked.current = false; setBusy(false); }
  }
  useOperationChanges(["inventory", "catalog"], () => { void refresh().catch(e => setError(userMessage(e.message))); }, !dialog && !busy && !session);
  const sessionPrompt = session && <div className={styles.error} role="alert"><p>{error || "انتهت جلسة الإدارة. سجّل الدخول للمتابعة."}</p><a href="/" target="_blank" rel="noopener noreferrer">دخول الإدارة في تبويب آخر</a><button disabled={busy} onClick={async () => { setBusy(true); try { await refresh(); setSession(false); setError(""); } catch (e) { setError(userMessage(e instanceof Error ? e.message : "تعذر التحقق.")); } finally { setBusy(false); } }}>التحقق من الدخول</button></div>;
  return <main dir="rtl" className={styles.page}><header className={styles.header}><div><h1>الثلاجة</h1></div><div className={styles.buttons}><button className={styles.primary} disabled={!enrolled.length || busy} onClick={() => open("TRANSFER")}>نقل للثلاجة</button><button disabled={!data || busy} onClick={() => open("ADD")}>+ إضافة صنف للثلاجة</button><Link href="/admin/pricing">أسعار الأصناف</Link></div></header>
    {!dialog && <>{sessionPrompt}{error && !session && <p className={styles.error} role="alert">{error}</p>}</>}{notice && <p className={styles.notice} role="status">{notice}</p>}
    {!data ? <p>جارٍ التحميل…</p> : <section className={styles.panel}>{!enrolled.length && <p className={styles.empty}>لا توجد أصناف في الثلاجة.</p>}{enrolled.map(entry => <article className={styles.productRow} key={entry.id}><div><strong>{entry.name}</strong><small>داخل الثلاجة: {packs(entry, entry.stock!.cooler)} · المحجوز منها: {packs(entry, entry.stock!.reservedCooler)}</small><small>متاح للنقل من المحل: {packs(entry, entry.stock!.room - entry.stock!.reservedRoom)}</small><small>المبرد بالمحل: {(entry.cooledStorePriceFils / 1000).toFixed(3)} د.أ · بالتوصيل: {(entry.cooledDeliveryPriceFils / 1000).toFixed(3)} د.أ</small></div><div className={styles.buttons}><button disabled={busy} onClick={() => open("TRANSFER", entry.id)}>نقل للثلاجة</button><button disabled={busy || entry.stock!.cooler <= entry.stock!.reservedCooler} onClick={() => open("RETURN", entry.id)}>إرجاع للمحل</button><Link href={`/admin/pricing?item=${encodeURIComponent(entry.id)}`}>تعديل السعر</Link></div></article>)}</section>}
    {!!misplaced.length && <section className={styles.panel}><h2>أرصدة سابقة لإرجاعها للمحل</h2>{misplaced.map(e => <article className={styles.productRow} key={e.id}><span>{e.name} — {packs(e, e.stock!.cooler)}</span><button disabled={busy || e.stock!.cooler <= e.stock!.reservedCooler} onClick={() => open("RETURN", e.id)}>إرجاع للمحل</button></article>)}</section>}
    {dialog && <div className={styles.overlay}><section ref={modal} tabIndex={-1} className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="cooler-title"><div className={styles.modalHeader}><h2 id="cooler-title">{dialog.action === "ADD" ? "إضافة صنف للثلاجة" : dialog.action === "RETURN" ? "إرجاع للمحل" : "نقل للثلاجة"}</h2><button aria-label="إغلاق" disabled={busy} onClick={() => setDialog(null)}>×</button></div>{sessionPrompt}{error && !session && <p className={styles.error} role="alert">{error}</p>}{!choices.length ? <p>لا توجد أصناف متاحة لهذه العملية.</p> : <form className={styles.form} onSubmit={save}><fieldset disabled={busy || session}><label>الصنف<select name="item" required defaultValue={dialog.id || ""}><option value="">اختر الصنف</option>{choices.filter(e => !dialog.id || e.id === dialog.id).map(e => <option key={e.id} value={e.id}>{e.name} — {e.packLabel}</option>)}</select></label>{dialog.action === "ADD" ? <><label>سعر المبرد بالمحل — دينار<input name="store" required inputMode="decimal" pattern="[0-9]+([.][0-9]{1,3})?"/></label><label>سعر المبرد بالتوصيل — دينار<input name="delivery" required inputMode="decimal" pattern="[0-9]+([.][0-9]{1,3})?"/></label></> : <label>الكمية — كرتونة أو شرنك كامل<input name="quantity" required type="number" min={1} max={1000000000} step={1} lang="en-GB"/></label>}<button className={styles.primary}>{busy ? "جارٍ الحفظ…" : dialog.action === "ADD" ? "إضافة للثلاجة" : "اعتماد النقل"}</button></fieldset></form>}</section></div>}
  </main>;
}
