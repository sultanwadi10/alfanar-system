import { capacityMl } from "@/lib/inventory/item-rules";
export function customerSpecialDeliveryPrice(customer:{specialDelivery20LPriceFils?:unknown}):number|null{
 const value=customer.specialDelivery20LPriceFils;if(value===undefined||value===null)return null;
 if(!Number.isSafeInteger(value)||(value as number)<0||(value as number)>10_000_000)throw Error("Invalid customer delivery price");
 return value as number;
}
export function refillBottleSize(product:{category?:string;name?:string;bottleSizeMl?:unknown},policySize?:unknown):number{
 if(product.category!=="REFILL")return 0;
 if(typeof policySize==="number"&&Number.isSafeInteger(policySize)&&policySize>0)return policySize;
 if(typeof product.bottleSizeMl==="number"&&Number.isSafeInteger(product.bottleSizeMl)&&product.bottleSizeMl>0)return product.bottleSizeMl;
 return capacityMl(product.name??"");
}
export function customerDeliveryUnitPrice(product:{category?:string;name?:string;bottleSizeMl?:unknown;deliveryPriceFils:number},customer:{specialDelivery20LPriceFils?:unknown},policySize?:unknown){
 const special=customerSpecialDeliveryPrice(customer);
 const overridden=special!==null&&refillBottleSize(product,policySize)===20000;
 return {unitPriceFils:overridden?special:product.deliveryPriceFils,source:overridden?"CUSTOMER":"STANDARD"} as const;
}
