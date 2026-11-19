export type PaymentLine = { category: string; quantity: number; unitPriceFils: number };
// Allocate oldest coupons to eligible refills in the displayed line order.
// Integer fils keep mixed payments exact, including customer-specific prices.
export function deliveryPaymentPlan(lines: PaymentLine[], available: number, coupons: boolean) {
  if (!Number.isSafeInteger(available) || available < 0) throw Error("Invalid coupon balance");
  let remaining = coupons ? available : 0, couponQuantity = 0, couponValueFils = 0, totalFils = 0, eligibleQuantity = 0;
  const items = lines.map(line => {
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1 || !Number.isSafeInteger(line.unitPriceFils) || line.unitPriceFils < 0) throw Error("Invalid payment line");
    const eligible = line.category === "REFILL";
    if (eligible) eligibleQuantity += line.quantity;
    const used = eligible ? Math.min(line.quantity, remaining) : 0;
    remaining -= used; couponQuantity += used; couponValueFils += used * line.unitPriceFils;
    totalFils += line.quantity * line.unitPriceFils;
    return { couponQuantity: used, moneyQuantity: line.quantity - used };
  });
  if (![totalFils, couponValueFils].every(Number.isSafeInteger)) throw Error("Invalid payment total");
  return { items, totalFils, couponQuantity, couponValueFils, moneyDueFils: totalFils - couponValueFils, eligibleQuantity, shortage: coupons ? eligibleQuantity - couponQuantity : 0 };
}
export function orderMoneyDue(order: { paymentMethod: string; totalFils: number; moneyDueFils?: number }) {
  return order.moneyDueFils ?? (order.paymentMethod === "COUPON" ? 0 : order.totalFils);
}
export function orderMoneyMethod(order: { paymentMethod: string; remainderMethod?: "CASH" | "CLICK" }) {
  return order.paymentMethod === "COUPON" ? order.remainderMethod ?? "CASH" : order.paymentMethod;
}
