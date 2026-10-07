import "server-only";

import { createHash } from "crypto";
import { Timestamp } from "firebase-admin/firestore";

import { getFirebaseAdminFirestore } from "@/lib/firebase/admin";
import { formatJordanPhoneLocal } from "@/lib/customers/customer-phone";
import {
  CUSTOMER_CREATED_SOURCES,
  type Customer,
  type CustomerPhoneIndexRecord,
  type CustomerRecord,
} from "@/types/customer";

const CUSTOMERS_COLLECTION =
  "customers";

const CUSTOMER_PHONE_INDEX_COLLECTION =
  "customerPhoneIndex";

export class CustomerPhoneAlreadyExistsError extends Error {
  constructor() {
    super(
      "يوجد عميل مسجل بهذا الرقم مسبقًا.",
    );

    this.name =
      "CustomerPhoneAlreadyExistsError";
  }
}

function getPhoneIndexId(
  phoneNormalized: string,
) {
  return createHash("sha256")
    .update(phoneNormalized)
    .digest("hex");
}

function toCustomer(
  id: string,
  record: CustomerRecord,
): Customer {
  return {
    id,

    name: record.name,

    phone: formatJordanPhoneLocal(
      record.phoneNormalized,
    ),

    phoneNormalized:
      record.phoneNormalized,

    primaryAddress:
      record.primaryAddress,

    adminNotes:
      record.adminNotes,

    couponBalance:
      record.couponBalance,

    appLinked:
      record.appAuthUid !== null,

    isArchived:
      record.isArchived,

    createdSource:
      record.createdSource,

    createdAt:
      record.createdAt.toDate(),

    updatedAt:
      record.updatedAt.toDate(),
  };
}

type CreateCustomerRecordInput = {
  name: string;

  phoneNormalized: string;

  primaryAddress: string;

  adminNotes: string;

  adminAuthUid: string;
};

export async function createCustomerRecord(
  input: CreateCustomerRecordInput,
): Promise<Customer> {
  const firestore =
    getFirebaseAdminFirestore();

  const customerRef =
    firestore
      .collection(
        CUSTOMERS_COLLECTION,
      )
      .doc();

  const phoneIndexRef =
    firestore
      .collection(
        CUSTOMER_PHONE_INDEX_COLLECTION,
      )
      .doc(
        getPhoneIndexId(
          input.phoneNormalized,
        ),
      );

  const now = Timestamp.now();

  const customerRecord: CustomerRecord =
    {
      name: input.name,

      phoneNormalized:
        input.phoneNormalized,

      primaryAddress:
        input.primaryAddress,

      adminNotes:
        input.adminNotes,

      couponBalance: 0,

      appAuthUid: null,

      isArchived: false,

      createdSource:
        CUSTOMER_CREATED_SOURCES.ADMIN,

      createdByAuthUid:
        input.adminAuthUid,

      updatedByAuthUid:
        input.adminAuthUid,

      createdAt: now,
      updatedAt: now,
    };

  const phoneIndexRecord: CustomerPhoneIndexRecord =
    {
      customerId: customerRef.id,

      phoneNormalized:
        input.phoneNormalized,

      createdAt: now,
    };

  await firestore.runTransaction(
    async (transaction) => {
      const existingPhone =
        await transaction.get(
          phoneIndexRef,
        );

      if (existingPhone.exists) {
        throw new CustomerPhoneAlreadyExistsError();
      }

      transaction.set(
        customerRef,
        customerRecord,
      );

      transaction.set(
        phoneIndexRef,
        phoneIndexRecord,
      );
    },
  );

  return toCustomer(
    customerRef.id,
    customerRecord,
  );
}

export async function listCustomers(): Promise<
  Customer[]
> {
  const firestore =
    getFirebaseAdminFirestore();

  const snapshot =
    await firestore
      .collection(
        CUSTOMERS_COLLECTION,
      )
      .orderBy(
        "createdAt",
        "desc",
      )
      .get();

  return snapshot.docs
    .map((document) => {
      const record =
        document.data() as CustomerRecord;

      return toCustomer(
        document.id,
        record,
      );
    })
    .filter(
      (customer) =>
        !customer.isArchived,
    );
}