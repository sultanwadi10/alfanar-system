import { redirect } from "next/navigation";

import { resolveOperatorSession } from "@/lib/auth/operator-session";
import { listProducts } from "@/lib/products/product-repository";
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

  const products = (await listProducts())
    .filter(
      (product) =>
        product.isActive &&
        product.showForEmployee,
    )
    .map((product) => ({
      id: product.id,
      name: product.name,
      category: product.category,
      deliveryPriceFils: product.deliveryPriceFils,
      requiresBottleOrigin: product.requiresBottleOrigin,
    }));

  return <DeliveryOrderForm products={products} />;
}
