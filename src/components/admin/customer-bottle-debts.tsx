"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
export function CustomerBottleDebts({ customerId }: { customerId: string }) {
  const [rows, setRows] = useState<Array<{ id: string; itemName: string; quantity: number }> | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController(); let cancelled = false;
    fetch(`/api/admin/inventory?view=debts&customerId=${encodeURIComponent(customerId)}`, { cache: "no-store", signal: controller.signal }).then(async response => { const result = await response.json(); if (!response.ok || !result.success) throw Error(); if (!cancelled) setRows(result.data); }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; controller.abort(); };
  }, [customerId]);
  return <section dir="rtl" style={{ marginBlock: 20, padding: 22, background: "var(--color-surface)", color: "var(--color-text)", border: "1px solid var(--color-border)", borderRadius: 18 }}><h2 style={{ marginTop: 0, fontSize: 20 }}>القوارير المستحقة للإرجاع</h2>{error ? <p role="alert">تعذر تحميل عهدة القوارير. راجع تبويب العهدة في المخزون.</p> : rows === null ? <p>جارٍ تحميل العهدة…</p> : rows.length ? rows.map(row => <p key={row.id}><strong>{row.quantity}</strong> — {row.itemName}</p>) : <p>لا توجد قوارير مستحقة مسجلة على هذا العميل.</p>}<Link href={`/admin/inventory?tab=debts&customer=${encodeURIComponent(customerId)}`}>استلام القوارير / مراجعة العهدة ←</Link></section>;
}
