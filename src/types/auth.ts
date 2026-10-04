export const AUTH_PRINCIPAL_TYPES = {
  ADMIN_ACCOUNT: "ADMIN_ACCOUNT",
  STORE_ACCOUNT: "STORE_ACCOUNT",
} as const;

export type AuthPrincipalType =
  (typeof AUTH_PRINCIPAL_TYPES)[keyof typeof AUTH_PRINCIPAL_TYPES];