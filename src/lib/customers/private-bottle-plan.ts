export type PrivateBottleOwnership = { origin: "JORDANIAN" | "SAUDI"; sizeMl: number; owned: number; reserved: number };
export type PrivateBottleLine = { category?: string; quantity: number; bottleOrigin?: string | null; bottleSizeMl?: number };

// Ownership is reusable; only simultaneously open orders reserve its quantity.
export function privateBottlePlan(lines: PrivateBottleLine[], rows: PrivateBottleOwnership[]) {
  const available=new Map(rows.map(row=>[`${row.origin}:${row.sizeMl}`,Math.max(0,row.owned-row.reserved)]));
  return lines.map(line=>{
    const key=`${line.bottleOrigin}:${line.bottleSizeMl}`;
    const row=line.category==="REFILL"?rows.find(row=>`${row.origin}:${row.sizeMl}`===key&&row.owned>0):undefined;
    if(!row)return {personalBottleQuantity:0,shortage:0};
    const personalBottleQuantity=Math.min(line.quantity,available.get(key)??0);
    available.set(key,(available.get(key)??0)-personalBottleQuantity);
    return {personalBottleQuantity,shortage:line.quantity-personalBottleQuantity};
  });
}
