import { CustomerReceivables } from "@/components/admin/customer-receivables";
import { CustomerBottleDebts } from "@/components/admin/customer-bottle-debts";
import { notFound } from "next/navigation";
import { getCustomerById } from "@/lib/customers/customer-repository";
import { countCustomerDeliveryOrders, getCustomerOperations } from "@/lib/coupons/booklet-service";
import type { Customer } from "@/types/customer";
import { CustomerDetailsManager } from "./customer-details-manager";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ customerId: string }> };
function creator(customer: Customer) {
  if (customer.createdSource === "EMPLOYEE") return customer.createdByEmployeeNameSnapshot
    ? `الموظف — ${customer.createdByEmployeeNameSnapshot}` : "موظف";
  if (customer.createdSource === "APP") return "العميل من التطبيق";
  return "الإدارة";
}
export default async function CustomerDetailsPage({ params }: Props) {
  const { customerId } = await params;
  const [customer, operations, totalOrderCount] = await Promise.all([
    getCustomerById(customerId),
    getCustomerOperations(customerId),
    countCustomerDeliveryOrders(customerId),
  ]);
  if (!customer) notFound();
  const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Amman", dateStyle: "long" });
  return <><CustomerDetailsManager
    customer={{
      id: customer.id, name: customer.name, phone: customer.phone,
      specialDelivery20LPriceFils: customer.specialDelivery20LPriceFils ?? null,
      primaryAddress: customer.primaryAddress, adminNotes: customer.adminNotes,
      couponBalance: customer.couponBalance, deliveryOrdersCount: totalOrderCount,
      appLinked: customer.appLinked, isArchived: customer.isArchived,
      creatorLabel: creator(customer), createdAtLabel: fmt.format(customer.createdAt),
      archivedAtLabel: customer.archivedAt ? fmt.format(customer.archivedAt) : null,
    }}
    walletData={{ ...operations, totalOrderCount }}
  /><CustomerReceivables key={customerId+"account"} customerId={customerId}/><CustomerBottleDebts key={customerId} customerId={customerId}/></>;
}
