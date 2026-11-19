export const SETTLEMENT_LIMIT = 100;
export const receivableIdPattern=/^(?:order_\d{8}-\d{3,8}|manual_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;
export function settlementPlan(rows: readonly { id: string; outstanding: number }[], amount: number) {
  if (!rows.length || rows.length > SETTLEMENT_LIMIT || new Set(rows.map(r => r.id)).size !== rows.length || !Number.isSafeInteger(amount) || amount < 1 || amount > 100_000_000 || rows.some(r => !Number.isSafeInteger(r.outstanding) || r.outstanding < 1)) throw Error("تحقق من المبلغ والطلبات المحددة.");
  const total = rows.reduce((sum, row) => sum + row.outstanding, 0);
  if (!Number.isSafeInteger(total) || amount > total) throw Error("مبلغ التسديد يتجاوز المستحق المحدد.");
  let remaining = amount;
  return rows.map(row => { const paid = Math.min(remaining, row.outstanding); remaining -= paid; return { id: row.id, amount: paid, outstanding: row.outstanding - paid }; }).filter(row => row.amount > 0);
}
