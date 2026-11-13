import DashboardView from "./dashboard-view";
import { getAdminSecurityContext } from "@/lib/security/get-admin-security-context";
export const dynamic = "force-dynamic";
export default async function AdminPage() {
  await getAdminSecurityContext();
  return <DashboardView initialData={null}/>;
}
