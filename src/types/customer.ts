import type { Timestamp } from "firebase-admin/firestore";

export const CUSTOMER_CREATED_SOURCES = {
  ADMIN: "ADMIN",
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

  createdSource: CustomerCreatedSource;

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

  createdSource: CustomerCreatedSource;

  createdByAuthUid: string | null;
  updatedByAuthUid: string | null;

  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export type CustomerPhoneIndexRecord = {
  customerId: string;

  phoneNormalized: string;

  createdAt: Timestamp;
};