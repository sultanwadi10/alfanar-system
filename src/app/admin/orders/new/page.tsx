import { getAdminSecurityContext } from "@/lib/security/get-admin-security-context";
import { listDeliveryProducts } from "@/lib/orders/delivery-products";
import DeliveryOrderForm from "@/app/employee/orders/new/delivery-order-form";
export const dynamic="force-dynamic";
export default async function AdminNewOrderPage(){
 await getAdminSecurityContext();
 const products=await listDeliveryProducts();
 return <DeliveryOrderForm products={products} mode="admin"/>;
}
