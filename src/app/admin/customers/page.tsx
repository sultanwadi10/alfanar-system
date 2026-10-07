import {
  listArchivedCustomers,
  listCustomers,
} from "@/lib/customers/customer-repository";
import type { Customer } from "@/types/customer";

import { CustomersManager } from "./customers-manager";

function getCreatorLabel(
  customer: Customer,
) {
  if (
    customer.createdSource ===
    "EMPLOYEE"
  ) {
    if (
      customer.createdByEmployeeNameSnapshot
    ) {
      return `الموظف — ${customer.createdByEmployeeNameSnapshot}`;
    }

    return "موظف";
  }

  if (
    customer.createdSource ===
    "APP"
  ) {
    return "العميل من التطبيق";
  }

  return "الإدارة";
}

function getArchivedAtLabel(
  customer: Customer,
) {
  if (!customer.archivedAt) {
    return null;
  }

  return new Intl.DateTimeFormat(
    "ar-JO",
    {
      year: "numeric",
      month: "short",
      day: "numeric",
    },
  ).format(
    customer.archivedAt,
  );
}

export default async function CustomersPage() {
  const [
    customers,
    archivedCustomers,
  ] = await Promise.all([
    listCustomers(),
    listArchivedCustomers(),
  ]);

  const activeItems =
    customers.map((customer) => ({
      id: customer.id,

      name: customer.name,

      phone: customer.phone,

      couponBalance:
        customer.couponBalance,

      lastOrderLabel: null,

      appLinked:
        customer.appLinked,

      hasSpecialPrice: false,

      creatorLabel:
        getCreatorLabel(customer),

      archivedAtLabel: null,
    }));

  const archivedItems =
    archivedCustomers.map(
      (customer) => ({
        id: customer.id,

        name: customer.name,

        phone: customer.phone,

        couponBalance:
          customer.couponBalance,

        lastOrderLabel: null,

        appLinked:
          customer.appLinked,

        hasSpecialPrice: false,

        creatorLabel:
          getCreatorLabel(customer),

        archivedAtLabel:
          getArchivedAtLabel(
            customer,
          ),
      }),
    );

  return (
    <CustomersManager
      activeCustomers={
        activeItems
      }
      archivedCustomers={
        archivedItems
      }
    />
  );
}