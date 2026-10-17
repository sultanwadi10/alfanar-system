import "server-only";

import {
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import {
  cookies,
} from "next/headers";
import {
  Timestamp,
  type DocumentData,
} from "firebase-admin/firestore";

import {
  getFirebaseAdminFirestore,
} from "@/lib/firebase/admin";

const ACCESS_SESSIONS_COLLECTION =
  "storeStealthAccessSessions";

const UNLOCK_RATE_LIMITS_COLLECTION =
  "storeStealthUnlockRateLimits";

export const STORE_STEALTH_ACCESS_CONFIG = {
  COOKIE_NAME:
    "workspace_entry",

  COOKIE_VERSION:
    "v1",

  TOKEN_BYTES: 32,

  ACCESS_EXPIRES_IN_MS:
    10 * 60 * 1000,

  UNLOCK_CODE_DIGITS: 10,

  ATTEMPT_WINDOW_MS:
    10 * 60 * 1000,

  MAX_FAILED_ATTEMPTS: 8,

  BLOCK_MS:
    15 * 60 * 1000,
} as const;

export type StoreStealthAccessRecord = {
  id: string;
  createdAt: Date;
  expiresAt: Date;
};

function getAccessSessionsCollection() {
  return getFirebaseAdminFirestore()
    .collection(
      ACCESS_SESSIONS_COLLECTION,
    );
}

function getUnlockRateLimitsCollection() {
  return getFirebaseAdminFirestore()
    .collection(
      UNLOCK_RATE_LIMITS_COLLECTION,
    );
}

function hashValue(
  value: string,
) {
  return createHash("sha256")
    .update(value)
    .digest("hex");
}

function readTimestamp(
  value: unknown,
) {
  return value instanceof Timestamp
    ? value
    : null;
}

function parseAccessRecord(
  id: string,
  data:
    DocumentData,
): StoreStealthAccessRecord | null {
  const createdAt =
    readTimestamp(
      data.createdAt,
    );

  const expiresAt =
    readTimestamp(
      data.expiresAt,
    );

  if (
    !createdAt ||
    !expiresAt
  ) {
    return null;
  }

  return {
    id,
    createdAt:
      createdAt.toDate(),
    expiresAt:
      expiresAt.toDate(),
  };
}

function parseAccessCookie(
  value: string,
) {
  const parts =
    value.split(".");

  if (
    parts.length !== 2 ||
    parts[0] !==
      STORE_STEALTH_ACCESS_CONFIG
        .COOKIE_VERSION ||
    !parts[1]
  ) {
    return null;
  }

  return parts[1];
}

function configuredUnlockCode() {
  const value =
    process.env
      .STORE_STEALTH_UNLOCK_CODE
      ?.trim();

  if (
    !value ||
    !new RegExp(
      `^\\d{${STORE_STEALTH_ACCESS_CONFIG.UNLOCK_CODE_DIGITS}}$`,
    ).test(value)
  ) {
    return null;
  }

  return value;
}

function secretValuesMatch(
  left: string,
  right: string,
) {
  const leftHash =
    createHash("sha256")
      .update(left)
      .digest();

  const rightHash =
    createHash("sha256")
      .update(right)
      .digest();

  return timingSafeEqual(
    leftHash,
    rightHash,
  );
}

function getRateLimitState(
  data:
    DocumentData | undefined,
) {
  return {
    count:
      typeof data?.count ===
        "number"
        ? data.count
        : 0,

    windowStartedAt:
      readTimestamp(
        data?.windowStartedAt,
      ),

    blockedUntil:
      readTimestamp(
        data?.blockedUntil,
      ),
  };
}

function getRateLimitReference(
  fingerprint: string,
) {
  return getUnlockRateLimitsCollection()
    .doc(
      hashValue(
        fingerprint,
      ),
    );
}

async function isUnlockRateLimited(
  fingerprint: string,
) {
  const snapshot =
    await getRateLimitReference(
      fingerprint,
    ).get();

  if (!snapshot.exists) {
    return false;
  }

  const state =
    getRateLimitState(
      snapshot.data(),
    );

  return Boolean(
    state.blockedUntil &&
    state.blockedUntil.toMillis() >
      Date.now(),
  );
}

async function registerFailedUnlockAttempt(
  fingerprint: string,
) {
  const db =
    getFirebaseAdminFirestore();

  const ref =
    getRateLimitReference(
      fingerprint,
    );

  await db.runTransaction(
    async (transaction) => {
      const snapshot =
        await transaction.get(
          ref,
        );

      const nowMs =
        Date.now();

      const now =
        Timestamp.fromMillis(
          nowMs,
        );

      const state =
        getRateLimitState(
          snapshot.exists
            ? snapshot.data()
            : undefined,
        );

      const windowExpired =
        !state.windowStartedAt ||
        nowMs -
          state.windowStartedAt.toMillis() >=
          STORE_STEALTH_ACCESS_CONFIG
            .ATTEMPT_WINDOW_MS;

      const nextCount =
        windowExpired
          ? 1
          : state.count + 1;

      const shouldBlock =
        nextCount >=
        STORE_STEALTH_ACCESS_CONFIG
          .MAX_FAILED_ATTEMPTS;

      transaction.set(
        ref,
        {
          count:
            nextCount,

          windowStartedAt:
            windowExpired
              ? now
              : state.windowStartedAt,

          blockedUntil:
            shouldBlock
              ? Timestamp.fromMillis(
                  nowMs +
                    STORE_STEALTH_ACCESS_CONFIG
                      .BLOCK_MS,
                )
              : null,

          updatedAt:
            now,
        },
        {
          merge: true,
        },
      );
    },
  );
}

async function clearFailedUnlockAttempts(
  fingerprint: string,
) {
  try {
    await getRateLimitReference(
      fingerprint,
    ).delete();
  } catch {
    // Best-effort cleanup after a valid unlock.
  }
}

export function buildStoreStealthRequestFingerprint(
  request: Request,
) {
  const forwardedFor =
    request.headers.get(
      "x-forwarded-for",
    );

  const ip =
    forwardedFor
      ?.split(",")[0]
      ?.trim() ||
    request.headers.get(
      "x-real-ip",
    ) ||
    "local";

  const userAgent =
    request.headers.get(
      "user-agent",
    ) ||
    "unknown";

  return `${ip}|${userAgent}`;
}

export async function verifyStoreStealthUnlock(
  input: {
    code: string;
    fingerprint: string;
  },
) {
  const expectedCode =
    configuredUnlockCode();

  if (!expectedCode) {
    return false;
  }

  if (
    await isUnlockRateLimited(
      input.fingerprint,
    )
  ) {
    return false;
  }

  const matches =
    secretValuesMatch(
      expectedCode,
      input.code,
    );

  if (!matches) {
    await registerFailedUnlockAttempt(
      input.fingerprint,
    );

    return false;
  }

  await clearFailedUnlockAttempts(
    input.fingerprint,
  );

  return true;
}

export async function createStoreStealthAccessGrant() {
  const token =
    randomBytes(
      STORE_STEALTH_ACCESS_CONFIG
        .TOKEN_BYTES,
    ).toString(
      "base64url",
    );

  const tokenHash =
    hashValue(
      token,
    );

  const now =
    Timestamp.now();

  const expiresAt =
    Timestamp.fromMillis(
      now.toMillis() +
      STORE_STEALTH_ACCESS_CONFIG
        .ACCESS_EXPIRES_IN_MS,
    );

  await getAccessSessionsCollection()
    .doc(
      tokenHash,
    )
    .set({
      createdAt:
        now,
      expiresAt,
    });

  return {
    cookieValue:
      `${STORE_STEALTH_ACCESS_CONFIG.COOKIE_VERSION}.${token}`,

    expiresAt:
      expiresAt.toDate(),
  };
}

export async function resolveCurrentStoreStealthAccess(): Promise<StoreStealthAccessRecord | null> {
  const cookieStore =
    await cookies();

  const rawCookie =
    cookieStore.get(
      STORE_STEALTH_ACCESS_CONFIG
        .COOKIE_NAME,
    )?.value;

  if (!rawCookie) {
    return null;
  }

  const token =
    parseAccessCookie(
      rawCookie,
    );

  if (!token) {
    return null;
  }

  const ref =
    getAccessSessionsCollection()
      .doc(
        hashValue(
          token,
        ),
      );

  const snapshot =
    await ref.get();

  if (!snapshot.exists) {
    return null;
  }

  const data =
    snapshot.data();

  if (!data) {
    return null;
  }

  const access =
    parseAccessRecord(
      snapshot.id,
      data,
    );

  if (!access) {
    return null;
  }

  if (
    access.expiresAt.getTime() <=
    Date.now()
  ) {
    try {
      await ref.delete();
    } catch {
      // Expired-grant cleanup is best-effort.
    }

    return null;
  }

  return access;
}

export function isStoreStealthAccessAllowed(
  access:
    StoreStealthAccessRecord,
  runtime: {
    sessionInvalidBefore:
      Date | null;
  },
) {
  if (
    runtime.sessionInvalidBefore &&
    access.createdAt.getTime() <=
      runtime.sessionInvalidBefore.getTime()
  ) {
    return false;
  }

  return true;
}

export async function requireCurrentStoreStealthAccess(
  runtime: {
    sessionInvalidBefore:
      Date | null;
  },
) {
  const access =
    await resolveCurrentStoreStealthAccess();

  if (
    !access ||
    !isStoreStealthAccessAllowed(
      access,
      runtime,
    )
  ) {
    throw new Error(
      "Store stealth access is not authorized.",
    );
  }

  return access;
}

export async function revokeCurrentStoreStealthAccess() {
  const cookieStore =
    await cookies();

  const rawCookie =
    cookieStore.get(
      STORE_STEALTH_ACCESS_CONFIG
        .COOKIE_NAME,
    )?.value;

  if (!rawCookie) {
    return;
  }

  const token =
    parseAccessCookie(
      rawCookie,
    );

  if (!token) {
    return;
  }

  try {
    await getAccessSessionsCollection()
      .doc(
        hashValue(
          token,
        ),
      )
      .delete();
  } catch {
    // Revocation cleanup is best-effort; the response also clears the cookie.
  }
}
