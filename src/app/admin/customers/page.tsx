import { listArchivedCustomers, listCustomers } from "@/lib/customers/customer-repository";
import { getActiveBookletBalances } from "@/lib/coupons/booklet-service";
import type { Customer } from "@/types/customer";
import { CustomersManager } from "./customers-manager";

export const dynamic = "force-dynamic";
function creator(customer: Customer) {
  if (customer.createdSource === "EMPLOYEE") return customer.createdByEmployeeNameSnapshot
    ? `الموظف — ${customer.createdByEmployeeNameSnapshot}` : "موظف";
  if (customer.createdSource === "APP") return "العميل من التطبيق";
  return "الإدارة";
}
function archiveDate(customer: Customer) {
  return customer.archivedAt ? new Intl.DateTimeFormat("ar-JO", {
    timeZone: "Asia/Amman", dateStyle: "medium",
  }).format(customer.archivedAt) : null;
}
export default async function CustomersPage() {
  const [active, archived, balances] = await Promise.all([
    listCustomers(), listArchivedCustomers(), getActiveBookletBalances(),
  ]);
  const serialize = (customer: Customer) => ({
    id: customer.id, name: customer.name, phone: customer.phone,
    couponBalance: balances.get(customer.id) ?? 0,
    lastOrderLabel: null, appLinked: customer.appLinked,
    hasSpecialPrice: false, creatorLabel: creator(customer),
    archivedAtLabel: archiveDate(customer),
  });
  return <CustomersManager activeCustomers={active.map(serialize)} archivedCustomers={archived.map(serialize)} />;
}
