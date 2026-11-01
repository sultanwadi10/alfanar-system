
import "server-only";

import {
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { isIP } from "node:net";
import { cookies } from "next/headers";
import { Timestamp } from "firebase-admin/firestore";

import {
  getFirebaseAdminFirestore,
} from "@/lib/firebase/admin";

const ACCESS_COLLECTION =
  "adminStealthAccessSessions";

const RATE_LIMIT_COLLECTION =
  "adminStealthUnlockRateLimits";

export const ADMIN_STEALTH_ACCESS_CONFIG = {
  COOKIE_NAME: "admin_workspace_entry",
  COOKIE_VERSION: "v1",
  TOKEN_BYTES: 32,
  CODE_DIGITS: 12,
  ACCESS_EXPIRES_IN_MS: 10 * 60 * 1000,
  ATTEMPT_WINDOW_MS: 10 * 60 * 1000,
  MAX_FAILED_ATTEMPTS: 8,
  BLOCK_MS: 15 * 60 * 1000,
} as const;

function hashValue(value: string) {
  return createHash("sha256")
    .update(value)
    .digest("hex");
}

function secretValuesMatch(
  left: string,
  right: string,
) {
  const leftHash = createHash("sha256")
    .update(left)
    .digest();

  const rightHash = createHash("sha256")
    .update(right)
    .digest();

  return timingSafeEqual(
    leftHash,
    rightHash,
  );
}

function getAccessCollection() {
  return getFirebaseAdminFirestore()
    .collection(ACCESS_COLLECTION);
}

function getRateLimitReference(
  fingerprint: string,
) {
  return getFirebaseAdminFirestore()
    .collection(RATE_LIMIT_COLLECTION)
    .doc(hashValue(fingerprint));
}

function parseAccessCookie(
  raw: string | undefined,
) {
  if (!raw) {
    return null;
  }

  const prefix =
    `${ADMIN_STEALTH_ACCESS_CONFIG.COOKIE_VERSION}.`;

  if (!raw.startsWith(prefix)) {
    return null;
  }

  const token = raw.slice(prefix.length);

  return /^[A-Za-z0-9_-]{43}$/.test(token)
    ? token
    : null;
}

/**
 * Build a rate-limit fingerprint.
 *
 * On Vercel, use the client IP supplied by
 * the platform's trusted proxy.
 *
 * During local development, do not trust
 * client-supplied forwarding headers.
 *
 * User-Agent is intentionally excluded
 * because the client can change it.
 */
export function buildAdminStealthRequestFingerprint(
  request: Request,
) {
  const forwardedIp =
    process.env.VERCEL === "1"
      ? (
          request.headers.get(
            "x-vercel-forwarded-for",
          ) ??
          request.headers.get(
            "x-forwarded-for",
          )
        )
      : null;

  const candidateIp = forwardedIp
    ?.split(",")[0]
    ?.trim();

  const trustedIp =
    candidateIp &&
    isIP(candidateIp) !== 0
      ? candidateIp
      : "local";

  return `admin-ip:${trustedIp}`;
}

/**
 * Validate the admin code while enforcing
 * rate limiting atomically in Firestore.
 *
 * A blocked source cannot unlock,
 * even when it submits the correct code.
 */
export async function verifyAdminStealthUnlock(
  input: {
    code: string;
    fingerprint: string;
  },
): Promise<boolean> {
  const expectedCode =
    process.env.ADMIN_STEALTH_UNLOCK_CODE
      ?.trim();

  const codePattern = new RegExp(
    `^\\d{${ADMIN_STEALTH_ACCESS_CONFIG.CODE_DIGITS}}$`,
  );

  if (
    !expectedCode ||
    !codePattern.test(expectedCode) ||
    !codePattern.test(input.code)
  ) {
    return false;
  }

  const db =
    getFirebaseAdminFirestore();

  const rateLimitRef =
    getRateLimitReference(
      input.fingerprint,
    );

  return db.runTransaction(
    async (transaction): Promise<boolean> => {
      const snapshot =
        await transaction.get(rateLimitRef);

      const data = snapshot.data();

      const nowMs = Date.now();

      const now =
        Timestamp.fromMillis(nowMs);

      const blockedUntil =
        data?.blockedUntil;

      // Reject while the active block remains.
      if (
        blockedUntil instanceof Timestamp &&
        blockedUntil.toMillis() > nowMs
      ) {
        return false;
      }

      const matches =
        secretValuesMatch(
          expectedCode,
          input.code,
        );

      if (matches) {
        // A correct unlock clears prior failures.
        if (snapshot.exists) {
          transaction.delete(rateLimitRef);
        }

        return true;
      }

      const windowStartedAt =
        data?.windowStartedAt;

      const windowActive =
        windowStartedAt instanceof Timestamp &&
        nowMs -
          windowStartedAt.toMillis() <
          ADMIN_STEALTH_ACCESS_CONFIG
            .ATTEMPT_WINDOW_MS;

      const previousCount =
        typeof data?.count === "number"
          ? data.count
          : 0;

      const count =
        windowActive
          ? previousCount + 1
          : 1;

      const shouldBlock =
        count >=
        ADMIN_STEALTH_ACCESS_CONFIG
          .MAX_FAILED_ATTEMPTS;

      transaction.set(
        rateLimitRef,
        {
          count,

          windowStartedAt:
            windowActive
              ? windowStartedAt
              : now,

          blockedUntil:
            shouldBlock
              ? Timestamp.fromMillis(
                  nowMs +
                    ADMIN_STEALTH_ACCESS_CONFIG
                      .BLOCK_MS,
                )
              : null,

          updatedAt: now,
        },
        {
          merge: true,
        },
      );

      return false;
    },
  );
}

/**
 * Create a temporary admin entry grant.
 * Only the token hash is stored in Firestore.
 */
export async function createAdminStealthAccessGrant() {
  const token = randomBytes(
    ADMIN_STEALTH_ACCESS_CONFIG.TOKEN_BYTES,
  ).toString("base64url");

  const expiresAt =
    Timestamp.fromMillis(
      Date.now() +
        ADMIN_STEALTH_ACCESS_CONFIG
          .ACCESS_EXPIRES_IN_MS,
    );

  await getAccessCollection()
    .doc(hashValue(token))
    .set({
      createdAt: Timestamp.now(),
      expiresAt,
    });

  return {
    cookieValue:
      `${ADMIN_STEALTH_ACCESS_CONFIG.COOKIE_VERSION}.${token}`,

    expiresAt: expiresAt.toDate(),
  };
}

/**
 * Check whether the current browser has
 * a valid, unexpired admin entry grant.
 */
export async function hasCurrentAdminStealthAccess() {
  const cookieStore = await cookies();

  const token = parseAccessCookie(
    cookieStore.get(
      ADMIN_STEALTH_ACCESS_CONFIG.COOKIE_NAME,
    )?.value,
  );

  if (!token) {
    return false;
  }

  const snapshot =
    await getAccessCollection()
      .doc(hashValue(token))
      .get();

  if (!snapshot.exists) {
    return false;
  }

  const expiresAt =
    snapshot.data()?.expiresAt;

  return (
    expiresAt instanceof Timestamp &&
    expiresAt.toMillis() > Date.now()
  );
}

/**
 * Revoke the current admin entry grant.
 * Used during logout and cleanup.
 */
export async function revokeCurrentAdminStealthAccess() {
  const cookieStore = await cookies();

  const token = parseAccessCookie(
    cookieStore.get(
      ADMIN_STEALTH_ACCESS_CONFIG.COOKIE_NAME,
    )?.value,
  );

  if (!token) {
    return;
  }

  await getAccessCollection()
    .doc(hashValue(token))
    .delete()
    .catch(() => {
      // Best-effort cleanup.
    });
}

/**
 * Atomically consume an admin entry grant.
 *
 * Once consumed, the grant cannot be used
 * again to create another admin session.
 */
export async function consumeCurrentAdminStealthAccess(): Promise<boolean> {
  const cookieStore = await cookies();

  const token = parseAccessCookie(
    cookieStore.get(
      ADMIN_STEALTH_ACCESS_CONFIG.COOKIE_NAME,
    )?.value,
  );

  if (!token) {
    return false;
  }

  const db =
    getFirebaseAdminFirestore();

  const ref =
    getAccessCollection()
      .doc(hashValue(token));

  return db.runTransaction(
    async (transaction): Promise<boolean> => {
      const snapshot =
        await transaction.get(ref);

      if (!snapshot.exists) {
        return false;
      }

      const expiresAt =
        snapshot.data()?.expiresAt;

      if (
        !(expiresAt instanceof Timestamp) ||
        expiresAt.toMillis() <= Date.now()
      ) {
        return false;
      }

      // Grant is valid for one successful login.
      transaction.delete(ref);

      return true;
    },
  );
}
