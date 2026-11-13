"use client";
import { useEffect, useState } from "react";
export function CustomerBottleReminder({ customerId,mode="employee" }: { customerId: string;mode?:"admin"|"employee" }) {
  const [state, setState] = useState<{ id: string; rows: Array<{ label: string; quantity: number }>; error: boolean } | null>(null);
  useEffect(() => {
    const controller = new AbortController(); let cancelled = false;
    fetch(`${mode==="admin"?"/api/admin/order-customer-bottle-debts":"/api/operator/customer-bottle-debts"}?customerId=${encodeURIComponent(customerId)}`, { cache: "no-store", signal: controller.signal }).then(async response => { const result = await response.json(); if (!response.ok || !result.success) throw Error(); if (!cancelled) setState({ id: customerId, rows: result.data, error: false }); }).catch(() => { if (!cancelled) setState({ id: customerId, rows: [], error: true }); });
    return () => { cancelled = true; controller.abort(); };
  }, [customerId,mode]);
  if (!state || state.id !== customerId) return <small>جارٍ التحقق من القوارير المستحقة…</small>;
  if (state.error) return <small role="status">تعذر التحقق من عهدة القوارير السابقة؛ راجع الإدارة عند الحاجة.</small>;
  if (!state.rows.length) return null;
  return <div role="status" style={{ marginTop: 10, padding: 12, border: "1px solid var(--order-border)", borderRadius: 10, background: "var(--order-soft-blue)", color: "var(--order-text)", fontSize: 13 }}><strong>تنبيه: عند العميل قوارير مستحقة من طلبات سابقة</strong>{state.rows.map((row, index) => <p key={index} style={{ margin: "5px 0" }}>{row.quantity} — {row.label}</p>)}</div>;
}
