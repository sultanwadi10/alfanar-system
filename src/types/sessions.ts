import type { AuthPrincipalType } from "./auth";

export type AdminSession = {
  authUid: string;
  principalType: Extract<
    AuthPrincipalType,
    "ADMIN_ACCOUNT"
  >;
  createdAt: Date;
  expiresAt: Date;
};

export type StoreSession = {
  authUid: string;
  principalType: Extract<
    AuthPrincipalType,
    "STORE_ACCOUNT"
  >;
  createdAt: Date;
  expiresAt: Date;
};

export type OperatorSession = {
  employeeId: string;
  shiftId?: string;
  createdAt: Date;
  expiresAt: Date;
};

export type VerifiedAdminSession = AdminSession;

export type VerifiedStoreSession = StoreSession;

export type VerifiedOperatorSession = OperatorSession;