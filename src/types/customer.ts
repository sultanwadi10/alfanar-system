import type { Timestamp } from "firebase-admin/firestore";

export const CUSTOMER_CREATED_SOURCES = {
  ADMIN: "ADMIN",
  EMPLOYEE: "EMPLOYEE",
  APP: "APP",
} as const;

export type CustomerCreatedSource =
  (typeof CUSTOMER_CREATED_SOURCES)[keyof typeof CUSTOMER_CREATED_SOURCES];

export type Customer = {
  id: string;

  name: string;

  phone: string;
  phoneNormalized: string;

  primaryAddress: string;
  adminNotes: string;

  couponBalance: number;

  appLinked: boolean;

  isArchived: boolean;

  archivedAt: Date | null;

  createdSource: CustomerCreatedSource;

  createdByEmployeeId: string | null;

  createdByEmployeeNameSnapshot:
    | string
    | null;

  createdAt: Date;
  updatedAt: Date;
};

export type CustomerRecord = {
  name: string;

  phoneNormalized: string;

  primaryAddress: string;
  adminNotes: string;

  couponBalance: number;

  appAuthUid: string | null;

  isArchived: boolean;

  archivedAt?: Timestamp | null;
  archivedByAuthUid?: string | null;

  createdSource: CustomerCreatedSource;

  createdByAuthUid: string | null;

  createdByEmployeeId?:
    | string
    | null;

  createdByEmployeeNameSnapshot?:
    | string
    | null;

  updatedByAuthUid: string | null;

  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export type CustomerPhoneIndexRecord = {
  customerId: string;

  phoneNormalized: string;

  createdAt: Timestamp;
};

export const CUSTOMER_COUPON_TRANSACTION_TYPES = {
  ADMIN_CREDIT: "ADMIN_CREDIT",
  ORDER_DEBIT: "ORDER_DEBIT",
} as const;

export type CustomerCouponTransactionType =
  (typeof CUSTOMER_COUPON_TRANSACTION_TYPES)[keyof typeof CUSTOMER_COUPON_TRANSACTION_TYPES];

export type CustomerCouponTransaction = {
  id: string;

  customerId: string;

  type: CustomerCouponTransactionType;

  amount: number;

  balanceBefore: number;
  balanceAfter: number;

  reason: string;

  createdByAuthUid: string | null;

  employeeId: string | null;

  orderId: string | null;

  createdAt: Date;
};

export type CustomerCouponTransactionRecord = {
  customerId: string;

  type: CustomerCouponTransactionType;

  amount: number;

  balanceBefore: number;
  balanceAfter: number;

  reason: string;

  createdByAuthUid: string | null;

  employeeId: string | null;

  orderId: string | null;

  createdAt: Timestamp;
};