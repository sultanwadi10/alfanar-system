import "server-only";
import { getFirebaseAdminAuth } from "@/lib/firebase/admin";
import { createDeliveryOrder,DeliveryOrderBusinessError } from "./delivery-order-repository";
import type { CreateDeliveryOrderInput } from "./delivery-order-validation";
export async function createAdminDeliveryOrder(input:CreateDeliveryOrderInput,adminUid:string){
 // Resolve the operational account on the server, never from an untrusted request.
 let cursor:string|undefined;const stores:string[]=[];
 for(let page=0;page<10;page++){
  const users=await getFirebaseAdminAuth().listUsers(1000,cursor);
  stores.push(...users.users.filter(u=>!u.disabled&&u.customClaims?.principalType==="STORE_ACCOUNT").map(u=>u.uid));
  if(stores.length>1)throw new DeliveryOrderBusinessError("AMBIGUOUS_STORE","يوجد أكثر من حساب محل. يلزم تحديد المحل من إعدادات الإدارة.");
  cursor=users.pageToken;if(!cursor)break;
 }
 if(cursor||stores.length!==1)throw new DeliveryOrderBusinessError("STORE_UNAVAILABLE","تعذر تحديد حساب المحل الفعّال. راجع إعدادات الحسابات.");
 return createDeliveryOrder(input,{storeAuthUid:stores[0],employeeId:adminUid,employeeName:"الإدارة",actorType:"ADMIN"});
}
