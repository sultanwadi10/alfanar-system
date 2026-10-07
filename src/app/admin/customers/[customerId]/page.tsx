import { notFound } from "next/navigation";

import {
  getCustomerById,
  listCustomerCouponTransactions,
} from "@/lib/customers/customer-repository";
import type { Customer } from "@/types/customer";

import { CustomerDetailsManager } from "./customer-details-manager";

type CustomerDetailsPageProps = {
  params: Promise<{
    customerId: string;
  }>;
};

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

export default async function CustomerDetailsPage({
  params,
}: CustomerDetailsPageProps) {
  const { customerId } =
    await params;

  const [
    customer,
    couponTransactions,
  ] = await Promise.all([
    getCustomerById(
      customerId,
    ),

    listCustomerCouponTransactions(
      customerId,
    ),
  ]);

  if (!customer) {
    notFound();
  }

  const dateFormatter =
    new Intl.DateTimeFormat(
      "ar-JO",
      {
        year: "numeric",
        month: "long",
        day: "numeric",
      },
    );

  const dateTimeFormatter =
    new Intl.DateTimeFormat(
      "ar-JO",
      {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      },
    );

  return (
    <CustomerDetailsManager
      customer={{
        id:
          customer.id,

        name:
          customer.name,

        phone:
          customer.phone,

        primaryAddress:
          customer.primaryAddress,

        adminNotes:
          customer.adminNotes,

        couponBalance:
          customer.couponBalance,

        appLinked:
          customer.appLinked,

        isArchived:
          customer.isArchived,

        creatorLabel:
          getCreatorLabel(
            customer,
          ),

        createdAtLabel:
          dateFormatter.format(
            customer.createdAt,
          ),

        archivedAtLabel:
          customer.archivedAt
            ? dateFormatter.format(
                customer.archivedAt,
              )
            : null,
      }}
      couponTransactions={
        couponTransactions.map(
          (transaction) => ({
            id:
              transaction.id,

            type:
              transaction.type,

            amount:
              transaction.amount,

            balanceBefore:
              transaction.balanceBefore,

            balanceAfter:
              transaction.balanceAfter,

            reason:
              transaction.reason,

            createdAtLabel:
              dateTimeFormatter.format(
                transaction.createdAt,
              ),
          }),
        )
      }
    />
  );
}