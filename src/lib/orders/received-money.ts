import { orderMoneyDue } from "./payment-plan";
export function receivedOrderMoney(order:{status:string;paymentState?:string;paymentMethod:string;totalFils:number;moneyDueFils?:number;collectedFils?:number;collectionMode?:string}){
  if(order.status!=="DELIVERED"||order.paymentState!=="COLLECTED"||order.collectionMode==="RECEIPTS")return 0;
  const due=orderMoneyDue(order),received=order.collectedFils??due;
  if(!Number.isSafeInteger(due)||due<0||!Number.isSafeInteger(received)||received<0||received>due)throw Error("Invalid collected amount");
  return received;
}
export function receivedLineValues(items:readonly {lineTotalFils:number;unitPriceFils?:number;moneyQuantity?:number}[],received:number){
  if(!Number.isSafeInteger(received)||received<0)throw Error("Invalid received amount");
  const weights=items.map(item=>{const value=item.moneyQuantity!==undefined&&item.unitPriceFils!==undefined?item.moneyQuantity*item.unitPriceFils:item.lineTotalFils;if(!Number.isSafeInteger(value)||value<0)throw Error("Invalid monetary line");return value;});
  const total=weights.reduce((sum,n)=>sum+n,0);if(received>total)throw Error("Collected amount exceeds monetary lines");
  if(!received)return weights.map(()=>0);
  const values=weights.map(n=>Number(BigInt(received)*BigInt(n)/BigInt(total)));let rest=received-values.reduce((s,n)=>s+n,0);
  for(let i=0;rest>0&&i<values.length;i++)if(weights[i]>0){values[i]++;rest--;}
  return values;
}
