import PricingManager from "./pricing-manager";

import {
  ensureDefaultProducts,
  listProducts,
} from "@/lib/products/product-repository";
import { getAdminSecurityContext } from "@/lib/security/get-admin-security-context";

export const dynamic =
  "force-dynamic";

export default async function PricingPage() {
  const securityContext =
    await getAdminSecurityContext();

  await ensureDefaultProducts(
    securityContext.authUid,
  );

  const products =
    await listProducts();

  return (
    <PricingManager
      initialProducts={
        products
      }
    />
  );
}