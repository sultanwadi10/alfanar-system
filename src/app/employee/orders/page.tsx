import { redirect } from "next/navigation";

import { resolveOperatorSession } from "@/lib/auth/operator-session";
import { getStoreSecurityContext } from "@/lib/security/get-store-security-context";
import OrdersToday from "./orders-today";

export const dynamic = "force-dynamic";

export default async function EmployeeOrdersPage() {
  const store = await getStoreSecurityContext();
  const operator = await resolveOperatorSession(store.authUid);
  if (!operator) redirect("/employee");
  return <OrdersToday />;
}
