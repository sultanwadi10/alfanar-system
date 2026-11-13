import CatalogManager from "./catalog-manager";
import { getAdminSecurityContext } from "@/lib/security/get-admin-security-context";
export const dynamic = "force-dynamic";
export default async function PricingPage() { await getAdminSecurityContext(); return <CatalogManager/>; }
