import { redirect } from "next/navigation";

import { resolveOperatorSession } from "@/lib/auth/operator-session";
import { listDeliveryProducts } from "@/lib/orders/delivery-products";
import { getStoreSecurityContext } from "@/lib/security/get-store-security-context";

import DeliveryOrderForm from "./delivery-order-form";

export const dynamic = "force-dynamic";

export default async function NewDeliveryOrderPage() {
  const storeContext =
    await getStoreSecurityContext();

  const operator =
    await resolveOperatorSession(
      storeContext.authUid,
    );

  if (!operator) {
    redirect("/employee");
  }

  const products = await listDeliveryProducts();

  return <DeliveryOrderForm products={products} />;
}
