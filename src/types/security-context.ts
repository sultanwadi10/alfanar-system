import type { AuthPrincipalType } from "@/types/auth";
import {
  USER_ROLES,
  
} from "@/types/roles";

export const SECURITY_CONTEXT_TYPES = {
  ADMIN: "ADMIN",
  STORE: "STORE",
  OPERATOR: "OPERATOR",
} as const;

export type SecurityContextType =
  (typeof SECURITY_CONTEXT_TYPES)[keyof typeof SECURITY_CONTEXT_TYPES];

type BaseSecurityContext = {
  authUid: string;
  principalType: AuthPrincipalType;
};

export type AdminSecurityContext = BaseSecurityContext & {
  contextType: typeof SECURITY_CONTEXT_TYPES.ADMIN;
  principalType: "ADMIN_ACCOUNT";
  role: typeof USER_ROLES.ADMIN;
};

export type StoreSecurityContext = BaseSecurityContext & {
  contextType: typeof SECURITY_CONTEXT_TYPES.STORE;
  principalType: "STORE_ACCOUNT";
};

export type OperatorSecurityContext = BaseSecurityContext & {
  contextType: typeof SECURITY_CONTEXT_TYPES.OPERATOR;
  principalType: "STORE_ACCOUNT";
  role: typeof USER_ROLES.EMPLOYEE;
  employeeId: string;
  shiftId?: string;
};

export type SecurityContext =
  | AdminSecurityContext
  | StoreSecurityContext
  | OperatorSecurityContext;