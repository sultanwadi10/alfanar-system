import CoolerManager from "./cooler-manager";
import { getAdminSecurityContext } from "@/lib/security/get-admin-security-context";
export default async function CoolerPage() { await getAdminSecurityContext(); return <CoolerManager/>; }
