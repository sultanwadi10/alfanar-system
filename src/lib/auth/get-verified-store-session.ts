import "server-only";

import { cookies } from "next/headers";
import type {
  DecodedIdToken,
} from "firebase-admin/auth";

import {
  requirePrincipalType,
} from "@/lib/auth/require-principal-type";
import {
  AUTH_SESSION_CONFIG,
} from "@/lib/auth/session-config";
import {
  verifyFirebaseSessionCookie,
} from "@/lib/auth/verify-firebase-session-cookie";
import {
  SecurityError,
} from "@/lib/security/security-error";
import {
  SECURITY_ERROR_CODES,
} from "@/lib/security/security-error-codes";
import {
  requirePairedStoreDevice,
} from "@/lib/store/store-device-repository";
import {
  getStoreRuntimeState,
  isStoreSessionAllowed,
} from "@/lib/store/store-runtime-repository";
import {
  AUTH_PRINCIPAL_TYPES,
} from "@/types/auth";

export async function getVerifiedStoreSession(): Promise<DecodedIdToken> {
  const cookieStore =
    await cookies();

  const sessionCookie =
    cookieStore.get(
      AUTH_SESSION_CONFIG
        .COOKIE_NAMES.STORE,
    )?.value;

  if (!sessionCookie) {
    throw new SecurityError(
      SECURITY_ERROR_CODES.UNAUTHENTICATED,
      "Store session is missing.",
      401,
    );
  }

  try {
    const decodedSession =
      await verifyFirebaseSessionCookie(
        sessionCookie,
      );

    requirePrincipalType(
      decodedSession,
      AUTH_PRINCIPAL_TYPES.STORE_ACCOUNT,
    );

    const runtime =
      await getStoreRuntimeState();

    const allowed =
      isStoreSessionAllowed(
        runtime,
        decodedSession.iat,
      );

    if (!allowed) {
      throw new SecurityError(
        SECURITY_ERROR_CODES.INVALID_SESSION,
        "Store session is no longer valid.",
        401,
      );
    }

    /*
     * Device authorization is independent from Store Auth.
     * Revoking a paired device therefore kills every Store API
     * on that browser even if its Firebase session cookie remains.
     */
    await requirePairedStoreDevice();

    return decodedSession;
  } catch (error) {
    if (
      error instanceof
      SecurityError
    ) {
      throw error;
    }

    throw new SecurityError(
      SECURITY_ERROR_CODES.INVALID_SESSION,
      "Store session is invalid or expired.",
      401,
    );
  }
}
