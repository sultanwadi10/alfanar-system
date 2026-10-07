import "server-only";

import { cookies } from "next/headers";
import type { DecodedIdToken } from "firebase-admin/auth";

import { requirePrincipalType } from "@/lib/auth/require-principal-type";
import { AUTH_SESSION_CONFIG } from "@/lib/auth/session-config";
import { verifyFirebaseSessionCookie } from "@/lib/auth/verify-firebase-session-cookie";
import { SecurityError } from "@/lib/security/security-error";
import {
  SECURITY_ERROR_CODES,
} from "@/lib/security/security-error-codes";
import { AUTH_PRINCIPAL_TYPES } from "@/types/auth";

export async function getVerifiedAdminSession(): Promise<DecodedIdToken> {
  const cookieStore = await cookies();

  const sessionCookie = cookieStore.get(
    AUTH_SESSION_CONFIG.COOKIE_NAMES.ADMIN,
  )?.value;

  if (!sessionCookie) {
    throw new SecurityError(
      SECURITY_ERROR_CODES.UNAUTHENTICATED,
      "Admin session is missing.",
      401,
    );
  }

  try {
    const decodedSession =
      await verifyFirebaseSessionCookie(sessionCookie);

    requirePrincipalType(
      decodedSession,
      AUTH_PRINCIPAL_TYPES.ADMIN_ACCOUNT,
    );

    return decodedSession;
  } catch (error) {
    if (error instanceof SecurityError) {
      throw error;
    }

    throw new SecurityError(
      SECURITY_ERROR_CODES.INVALID_SESSION,
      "Admin session is invalid or expired.",
      401,
    );
  }
}