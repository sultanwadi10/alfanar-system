"use client";
import { useState } from "react";
import type { BottleReturn } from "@/types/inventory";
import styles from "./bottle-return-fields.module.css";
export type BottleRequirement = { itemId: string; label: string; quantity: number };
export function bottleReturnsComplete(requirements: BottleRequirement[], value: BottleReturn[]) {
  return value.length === requirements.length && new Set(value.map(r => r.itemId)).size === value.length && requirements.every(r => value.some(v => v.itemId === r.itemId && Number.isSafeInteger(v.quantity) && v.quantity >= 0 && v.quantity <= r.quantity));
}
export function BottleReturnFields({ requirements, value, onChange, disabled = false }: { requirements: BottleRequirement[]; value: BottleReturn[]; onChange: (value: BottleReturn[]) => void; disabled?: boolean }) {
  const [mode, setMode] = useState<"ALL" | "PARTIAL" | "NONE" | null>(null);
  if (!requirements.length) return null;
  const complete = bottleReturnsComplete(requirements, value), received = value.reduce((sum, r) => sum + r.quantity, 0), expected = requirements.reduce((sum, r) => sum + r.quantity, 0);
  function choose(next: "ALL" | "PARTIAL" | "NONE") { setMode(next); onChange(next === "PARTIAL" ? [] : requirements.map(r => ({ itemId: r.itemId, quantity: next === "ALL" ? r.quantity : 0 }))); }
  return <fieldset className={styles.panel} disabled={disabled}>
    <legend>الفارغ مقابل هذا الطلب</legend>
    <div className={styles.choices}>{([["ALL", "استلمت الكل"], ["PARTIAL", "استلمت جزءًا"], ["NONE", "لم أستلم أي فارغ"]] as const).map(([key, label]) => <button type="button" key={key} aria-pressed={mode === key} onClick={() => choose(key)}>{label}</button>)}</div>
    {requirements.map(r => <div className={styles.row} key={r.itemId}><span>{r.label}<small>المطلوب استرجاعه: {r.quantity}</small></span>{mode === "PARTIAL" ? <label>المستلم<input aria-label={`عدد الفارغ المستلم: ${r.label}`} type="number" inputMode="numeric" min={0} max={r.quantity} step={1} required value={value.find(v => v.itemId === r.itemId)?.quantity ?? ""} onChange={event => { const raw = event.target.value, quantity = raw === "" ? NaN : Number(raw); onChange([...value.filter(v => v.itemId !== r.itemId), ...(Number.isSafeInteger(quantity) && quantity >= 0 && quantity <= r.quantity ? [{ itemId: r.itemId, quantity }] : [])]); }} lang="en-GB"/></label> : mode && <strong>استلمنا {value.find(v => v.itemId === r.itemId)?.quantity ?? 0}</strong>}</div>)}
    {complete ? <p className={styles.summary} role="status">سلّمت {expected} قارورة، استلمت {received} فارغة، بقي على الزبون {expected - received} من هذا الطلب.</p> : null}

  </fieldset>;
}
export function PreviousBottleReturnFields({ debts, value, onChange, disabled = false }: { debts: BottleRequirement[]; value: BottleReturn[]; onChange: (rows: BottleReturn[]) => void; disabled?: boolean }) {
  const [enabled, setEnabled] = useState(false);
  if (!debts.length) return null;
  return <fieldset className={styles.panel} disabled={disabled}><legend>قوارير من طلبات سابقة — اختياري</legend><label className={styles.check}><input type="checkbox" checked={enabled} onChange={event => { setEnabled(event.target.checked); onChange([]); }}/>استلمت فارغًا لتسوية عهدة سابقة</label>{enabled && <>{debts.map(row => <div className={styles.row} key={row.itemId}><span>{row.label}<small>العهدة السابقة: {row.quantity}</small></span><label>رجّع سابقًا<input aria-label={`الفارغ السابق المستلم: ${row.label}`} type="number" inputMode="numeric" min={0} max={row.quantity} step={1} value={value.find(v => v.itemId === row.itemId)?.quantity ?? 0} onChange={event => { const quantity = event.target.value === "" ? 0 : Number(event.target.value); onChange([...value.filter(v => v.itemId !== row.itemId), ...(quantity !== 0 ? [{ itemId: row.itemId, quantity }] : [])]); }} lang="en-GB"/></label></div>)}</>}</fieldset>;
}
