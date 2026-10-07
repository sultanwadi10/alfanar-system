import "server-only";

import type { DecodedIdToken } from "firebase-admin/auth";

import {
  AUTH_PRINCIPAL_TYPES,
  type AuthPrincipalType,
} from "@/types/auth";

import {
  SECURITY_ERROR_CODES,
} from "@/lib/security/security-error-codes";
import { SecurityError } from "@/lib/security/security-error";

export function requirePrincipalType(
  decodedToken: DecodedIdToken,
  expectedPrincipalType: AuthPrincipalType,
): void {
  const principalType = decodedToken.principalType;

  if (
    principalType !== AUTH_PRINCIPAL_TYPES.ADMIN_ACCOUNT &&
    principalType !== AUTH_PRINCIPAL_TYPES.STORE_ACCOUNT
  ) {
    throw new SecurityError(
      SECURITY_ERROR_CODES.FORBIDDEN,
      "Authenticated account has no valid principal classification.",
      403,
    );
  }

  if (principalType !== expectedPrincipalType) {
    throw new SecurityError(
      SECURITY_ERROR_CODES.FORBIDDEN,
      "Authenticated account is not allowed in this context.",
      403,
    );
  }
}