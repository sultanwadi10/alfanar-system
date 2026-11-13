import "server-only";
import { listProducts } from "@/lib/products/product-repository";
import { getFirebaseAdminFirestore } from "@/lib/firebase/admin";
import { refillBottleSize } from "@/lib/customers/delivery-pricing";
export async function listDeliveryProducts(){
 const rows=(await listProducts()).filter(p=>p.isActive&&p.showForEmployee&&p.deliveryEnabled!==false),db=getFirebaseAdminFirestore();
 return Promise.all(rows.map(async p=>{
  const policy=p.category==="REFILL"?(await db.collection("inventoryPolicies").doc(p.id).get()).data():null;
  return {id:p.id,name:p.name,category:p.category,deliveryPriceFils:p.deliveryPriceFils,requiresBottleOrigin:p.requiresBottleOrigin,bottleSizeMl:refillBottleSize(p,policy?.bottleSizeMl)};
 }));
}
