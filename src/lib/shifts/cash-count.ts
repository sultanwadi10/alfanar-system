export type CashCount = { actualCashFils: number; banknotesFils?: number; coinsFils?: number };
const valid = (n: unknown): n is number => Number.isSafeInteger(n) && (n as number) >= 0 && (n as number) <= 100_000_000;
export function cashCount(input: CashCount) {
  if (!valid(input.actualCashFils)) throw Error("قيمة الكاش الفعلي غير صالحة.");
  if (input.banknotesFils === undefined && input.coinsFils === undefined) return { actualCashFils: input.actualCashFils, banknotesFils: null, coinsFils: null };
  if (!valid(input.banknotesFils) || !valid(input.coinsFils) || input.banknotesFils + input.coinsFils !== input.actualCashFils) throw Error("مجموع الورقي والمعدني لا يطابق الكاش الفعلي.");
  return { actualCashFils: input.actualCashFils, banknotesFils: input.banknotesFils, coinsFils: input.coinsFils };
}
