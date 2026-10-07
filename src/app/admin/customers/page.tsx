import { CustomersManager } from "./customers-manager";

import { listCustomers } from "@/lib/customers/customer-repository";

export default async function CustomersPage() {
  const customers =
    await listCustomers();

  const customerListItems =
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
    }));

  return (
    <CustomersManager
      customers={customerListItems}
    />
  );
}