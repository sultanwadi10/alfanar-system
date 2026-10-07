import "server-only";

import { createHash } from "crypto";
import { Timestamp } from "firebase-admin/firestore";

import { formatJordanPhoneLocal } from "@/lib/customers/customer-phone";
import { getFirebaseAdminFirestore } from "@/lib/firebase/admin";
import {
  CUSTOMER_COUPON_TRANSACTION_TYPES,
  CUSTOMER_CREATED_SOURCES,
  type Customer,
  type CustomerCouponTransaction,
  type CustomerCouponTransactionRecord,
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

export class CustomerLinkedPhoneChangeError extends Error {
  constructor() {
    super(
      "لا يمكن تغيير رقم هاتف عميل مرتبط بالتطبيق مباشرة.",
    );

    this.name =
      "CustomerLinkedPhoneChangeError";
  }
}

type CustomerCreator =
  | {
      source:
        typeof CUSTOMER_CREATED_SOURCES.ADMIN;

      authUid: string;
    }
  | {
      source:
        typeof CUSTOMER_CREATED_SOURCES.EMPLOYEE;

      authUid: string;

      employeeId: string;

      employeeNameSnapshot: string;
    }
  | {
      source:
        typeof CUSTOMER_CREATED_SOURCES.APP;

      authUid: string;
    };

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
      record.primaryAddress ?? "",

    adminNotes:
      record.adminNotes ?? "",

    couponBalance:
      record.couponBalance ?? 0,

    appLinked:
      record.appAuthUid != null,

    isArchived:
      record.isArchived === true,

    archivedAt:
      record.archivedAt?.toDate() ??
      null,

    createdSource:
      record.createdSource ??
      CUSTOMER_CREATED_SOURCES.ADMIN,

    createdByEmployeeId:
      record.createdByEmployeeId ??
      null,

    createdByEmployeeNameSnapshot:
      record.createdByEmployeeNameSnapshot ??
      null,

    createdAt:
      record.createdAt.toDate(),

    updatedAt:
      record.updatedAt.toDate(),
  };
}

function getCreatorFields(
  creator: CustomerCreator,
) {
  if (
    creator.source ===
    CUSTOMER_CREATED_SOURCES.EMPLOYEE
  ) {
    return {
      createdSource:
        CUSTOMER_CREATED_SOURCES.EMPLOYEE,

      createdByAuthUid:
        creator.authUid,

      createdByEmployeeId:
        creator.employeeId,

      createdByEmployeeNameSnapshot:
        creator.employeeNameSnapshot,
    };
  }

  return {
    createdSource:
      creator.source,

    createdByAuthUid:
      creator.authUid,

    createdByEmployeeId: null,

    createdByEmployeeNameSnapshot:
      null,
  };
}

type CreateCustomerRecordInput = {
  name: string;

  phoneNormalized: string;

  primaryAddress: string;

  adminNotes: string;

  creator: CustomerCreator;
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

  const creatorFields =
    getCreatorFields(
      input.creator,
    );

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

      archivedAt: null,
      archivedByAuthUid: null,

      ...creatorFields,

      updatedByAuthUid:
        input.creator.authUid,

      createdAt: now,
      updatedAt: now,
    };

  const phoneIndexRecord: CustomerPhoneIndexRecord =
    {
      customerId:
        customerRef.id,

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

async function getAllCustomers(): Promise<
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

  return snapshot.docs.map(
    (document) =>
      toCustomer(
        document.id,
        document.data() as CustomerRecord,
      ),
  );
}

export async function listCustomers(): Promise<
  Customer[]
> {
  const customers =
    await getAllCustomers();

  return customers.filter(
    (customer) =>
      !customer.isArchived,
  );
}

export async function listArchivedCustomers(): Promise<
  Customer[]
> {
  const customers =
    await getAllCustomers();

  return customers.filter(
    (customer) =>
      customer.isArchived,
  );
}

export async function getCustomerById(
  customerId: string,
): Promise<Customer | null> {
  const firestore =
    getFirebaseAdminFirestore();

  const snapshot =
    await firestore
      .collection(
        CUSTOMERS_COLLECTION,
      )
      .doc(customerId)
      .get();

  if (!snapshot.exists) {
    return null;
  }

  return toCustomer(
    snapshot.id,
    snapshot.data() as CustomerRecord,
  );
}

type UpdateCustomerRecordInput = {
  name: string;

  phoneNormalized: string;

  primaryAddress: string;

  adminNotes: string;

  adminAuthUid: string;
};

export async function updateCustomerRecord(
  customerId: string,
  input: UpdateCustomerRecordInput,
): Promise<Customer | null> {
  const firestore =
    getFirebaseAdminFirestore();

  const customerRef =
    firestore
      .collection(
        CUSTOMERS_COLLECTION,
      )
      .doc(customerId);

  return firestore.runTransaction(
    async (transaction) => {
      const customerSnapshot =
        await transaction.get(
          customerRef,
        );

      if (!customerSnapshot.exists) {
        return null;
      }

      const existing =
        customerSnapshot.data() as CustomerRecord;

      const phoneChanged =
        existing.phoneNormalized !==
        input.phoneNormalized;

      const now = Timestamp.now();

      if (phoneChanged) {
        if (
          existing.appAuthUid != null
        ) {
          throw new CustomerLinkedPhoneChangeError();
        }

        const newPhoneIndexRef =
          firestore
            .collection(
              CUSTOMER_PHONE_INDEX_COLLECTION,
            )
            .doc(
              getPhoneIndexId(
                input.phoneNormalized,
              ),
            );

        const newPhoneSnapshot =
          await transaction.get(
            newPhoneIndexRef,
          );

        if (
          newPhoneSnapshot.exists
        ) {
          throw new CustomerPhoneAlreadyExistsError();
        }

        const oldPhoneIndexRef =
          firestore
            .collection(
              CUSTOMER_PHONE_INDEX_COLLECTION,
            )
            .doc(
              getPhoneIndexId(
                existing.phoneNormalized,
              ),
            );

        const newPhoneIndexRecord: CustomerPhoneIndexRecord =
          {
            customerId,

            phoneNormalized:
              input.phoneNormalized,

            createdAt: now,
          };

        transaction.delete(
          oldPhoneIndexRef,
        );

        transaction.set(
          newPhoneIndexRef,
          newPhoneIndexRecord,
        );
      }

      const updatedRecord: CustomerRecord =
        {
          ...existing,

          name: input.name,

          phoneNormalized:
            input.phoneNormalized,

          primaryAddress:
            input.primaryAddress,

          adminNotes:
            input.adminNotes,

          updatedByAuthUid:
            input.adminAuthUid,

          updatedAt: now,
        };

      transaction.update(
        customerRef,
        {
          name:
            updatedRecord.name,

          phoneNormalized:
            updatedRecord.phoneNormalized,

          primaryAddress:
            updatedRecord.primaryAddress,

          adminNotes:
            updatedRecord.adminNotes,

          updatedByAuthUid:
            updatedRecord.updatedByAuthUid,

          updatedAt:
            updatedRecord.updatedAt,
        },
      );

      return toCustomer(
        customerId,
        updatedRecord,
      );
    },
  );
}

export async function archiveCustomerRecord(
  customerId: string,
  adminAuthUid: string,
): Promise<boolean> {
  const firestore =
    getFirebaseAdminFirestore();

  const customerRef =
    firestore
      .collection(
        CUSTOMERS_COLLECTION,
      )
      .doc(customerId);

  return firestore.runTransaction(
    async (transaction) => {
      const snapshot =
        await transaction.get(
          customerRef,
        );

      if (!snapshot.exists) {
        return false;
      }

      transaction.update(
        customerRef,
        {
          isArchived: true,

          archivedAt:
            Timestamp.now(),

          archivedByAuthUid:
            adminAuthUid,

          updatedByAuthUid:
            adminAuthUid,

          updatedAt:
            Timestamp.now(),
        },
      );

      return true;
    },
  );
}

export async function restoreCustomerRecord(
  customerId: string,
  adminAuthUid: string,
): Promise<boolean> {
  const firestore =
    getFirebaseAdminFirestore();

  const customerRef =
    firestore
      .collection(
        CUSTOMERS_COLLECTION,
      )
      .doc(customerId);

  return firestore.runTransaction(
    async (transaction) => {
      const snapshot =
        await transaction.get(
          customerRef,
        );

      if (!snapshot.exists) {
        return false;
      }

      transaction.update(
        customerRef,
        {
          isArchived: false,

          archivedAt: null,

          archivedByAuthUid:
            null,

          updatedByAuthUid:
            adminAuthUid,

          updatedAt:
            Timestamp.now(),
        },
      );

      return true;
    },
  );
}
export class CustomerCouponLimitError extends Error {
  constructor() {
    super(
      "لا يمكن أن يتجاوز رصيد العميل 22 كوبون.",
    );

    this.name =
      "CustomerCouponLimitError";
  }
}

export class ArchivedCustomerOperationError extends Error {
  constructor() {
    super(
      "لا يمكن تعديل محفظة عميل مؤرشف.",
    );

    this.name =
      "ArchivedCustomerOperationError";
  }
}

function toCouponTransaction(
  id: string,
  record: CustomerCouponTransactionRecord,
): CustomerCouponTransaction {
  return {
    id,

    customerId:
      record.customerId,

    type:
      record.type,

    amount:
      record.amount,

    balanceBefore:
      record.balanceBefore,

    balanceAfter:
      record.balanceAfter,

    reason:
      record.reason,

    createdByAuthUid:
      record.createdByAuthUid,

    employeeId:
      record.employeeId,

    orderId:
      record.orderId,

    createdAt:
      record.createdAt.toDate(),
  };
}

type CreditCustomerCouponsInput = {
  amount: number;

  reason: string;

  adminAuthUid: string;
};

export async function creditCustomerCoupons(
  customerId: string,
  input: CreditCustomerCouponsInput,
): Promise<CustomerCouponTransaction | null> {
  const firestore =
    getFirebaseAdminFirestore();

  const customerRef =
    firestore
      .collection(
        CUSTOMERS_COLLECTION,
      )
      .doc(customerId);

  const couponTransactionRef =
    customerRef
      .collection(
        "couponTransactions",
      )
      .doc();

  return firestore.runTransaction(
    async (transaction) => {
      const customerSnapshot =
        await transaction.get(
          customerRef,
        );

      if (!customerSnapshot.exists) {
        return null;
      }

      const customer =
        customerSnapshot.data() as CustomerRecord;

      if (
        customer.isArchived === true
      ) {
        throw new ArchivedCustomerOperationError();
      }

      const balanceBefore =
        customer.couponBalance ?? 0;

      const balanceAfter =
        balanceBefore +
        input.amount;

      if (balanceAfter > 22) {
        throw new CustomerCouponLimitError();
      }

      const now =
        Timestamp.now();

      const transactionRecord: CustomerCouponTransactionRecord =
        {
          customerId,

          type:
            CUSTOMER_COUPON_TRANSACTION_TYPES.ADMIN_CREDIT,

          amount:
            input.amount,

          balanceBefore,

          balanceAfter,

          reason:
            input.reason,

          createdByAuthUid:
            input.adminAuthUid,

          employeeId: null,

          orderId: null,

          createdAt: now,
        };

      transaction.update(
        customerRef,
        {
          couponBalance:
            balanceAfter,

          updatedByAuthUid:
            input.adminAuthUid,

          updatedAt:
            now,
        },
      );

      transaction.set(
        couponTransactionRef,
        transactionRecord,
      );

      return toCouponTransaction(
        couponTransactionRef.id,
        transactionRecord,
      );
    },
  );
}

export async function listCustomerCouponTransactions(
  customerId: string,
): Promise<
  CustomerCouponTransaction[]
> {
  const firestore =
    getFirebaseAdminFirestore();

  const snapshot =
    await firestore
      .collection(
        CUSTOMERS_COLLECTION,
      )
      .doc(customerId)
      .collection(
        "couponTransactions",
      )
      .orderBy(
        "createdAt",
        "desc",
      )
      .limit(100)
      .get();

  return snapshot.docs.map(
    (document) =>
      toCouponTransaction(
        document.id,
        document.data() as CustomerCouponTransactionRecord,
      ),
  );
}