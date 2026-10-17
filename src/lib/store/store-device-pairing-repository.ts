import "server-only";

import {
  createHash,
  randomInt,
} from "node:crypto";
import {
  Timestamp,
  type DocumentData,
} from "firebase-admin/firestore";

import {
  getFirebaseAdminFirestore,
} from "@/lib/firebase/admin";
import {
  STORE_DEVICE_CONFIG,
} from "@/lib/store/store-device-config";
import {
  buildStoreDeviceCredential,
  getStoreDeviceDocumentReference,
} from "@/lib/store/store-device-repository";

const PAIRING_CODES_COLLECTION =
  "storeDevicePairingCodes";

const PAIRING_RATE_LIMITS_COLLECTION =
  "storeDevicePairingRateLimits";

export class PairingRateLimitedError extends Error {
  constructor() {
    super(
      "Too many pairing attempts.",
    );

    this.name =
      "PairingRateLimitedError";
  }
}

function hashValue(
  value: string,
) {
  return createHash("sha256")
    .update(value)
    .digest("hex");
}

function getPairingCodesCollection() {
  return getFirebaseAdminFirestore()
    .collection(
      PAIRING_CODES_COLLECTION,
    );
}

function getRateLimitsCollection() {
  return getFirebaseAdminFirestore()
    .collection(
      PAIRING_RATE_LIMITS_COLLECTION,
    );
}

function readTimestamp(
  value: unknown,
) {
  return value instanceof Timestamp
    ? value
    : null;
}

function normalizeCode(
  value: string,
) {
  return value.replace(
    /\D/g,
    "",
  );
}

function generateCode() {
  const max =
    10 **
    STORE_DEVICE_CONFIG
      .PAIRING_CODE_DIGITS;

  return randomInt(
    0,
    max,
  )
    .toString()
    .padStart(
      STORE_DEVICE_CONFIG
        .PAIRING_CODE_DIGITS,
      "0",
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

async function registerPairingAttempt(
  fingerprint: string,
) {
  const db =
    getFirebaseAdminFirestore();

  const ref =
    getRateLimitsCollection()
      .doc(
        hashValue(
          fingerprint,
        ),
      );

  const blocked =
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

        const current =
          getRateLimitState(
            snapshot.exists
              ? snapshot.data()
              : undefined,
          );

        if (
          current.blockedUntil &&
          current.blockedUntil.toMillis() >
            nowMs
        ) {
          return true;
        }

        const windowExpired =
          !current.windowStartedAt ||
          nowMs -
            current.windowStartedAt.toMillis() >=
            STORE_DEVICE_CONFIG
              .PAIRING_ATTEMPT_WINDOW_MS;

        const nextCount =
          windowExpired
            ? 1
            : current.count + 1;

        const shouldBlock =
          nextCount >
          STORE_DEVICE_CONFIG
            .PAIRING_MAX_ATTEMPTS;

        transaction.set(
          ref,
          {
            count:
              nextCount,

            windowStartedAt:
              windowExpired
                ? now
                : current.windowStartedAt,

            blockedUntil:
              shouldBlock
                ? Timestamp.fromMillis(
                    nowMs +
                    STORE_DEVICE_CONFIG
                      .PAIRING_BLOCK_MS,
                  )
                : null,

            updatedAt:
              now,
          },
          {
            merge: true,
          },
        );

        return shouldBlock;
      },
    );

  if (blocked) {
    throw new PairingRateLimitedError();
  }
}

async function clearPairingAttempts(
  fingerprint: string,
) {
  try {
    await getRateLimitsCollection()
      .doc(
        hashValue(
          fingerprint,
        ),
      )
      .delete();
  } catch {
    // Rate-limit cleanup is best-effort after successful pairing.
  }
}

export function buildPairingRequestFingerprint(
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

export async function createStoreDevicePairingCode(
  adminAuthUid: string,
) {
  const code =
    generateCode();

  const now =
    Timestamp.now();

  const expiresAt =
    Timestamp.fromMillis(
      now.toMillis() +
      STORE_DEVICE_CONFIG
        .PAIRING_CODE_EXPIRES_IN_MS,
    );

  await getPairingCodesCollection()
    .doc(
      hashValue(
        code,
      ),
    )
    .set({
      createdAt:
        now,

      expiresAt,

      createdByAdminUid:
        adminAuthUid,

      usedAt:
        null,

      usedByDeviceId:
        null,
    });

  return {
    code,
    expiresAt:
      expiresAt.toDate(),
  };
}

export async function pairStoreDevice(
  input: {
    code: string;
    deviceName: string;
    fingerprint: string;
  },
) {
  await registerPairingAttempt(
    input.fingerprint,
  );

  const code =
    normalizeCode(
      input.code,
    );

  if (
    code.length !==
    STORE_DEVICE_CONFIG
      .PAIRING_CODE_DIGITS
  ) {
    return null;
  }

  const db =
    getFirebaseAdminFirestore();

  const challengeRef =
    getPairingCodesCollection()
      .doc(
        hashValue(
          code,
        ),
      );

  const result =
    await db.runTransaction(
      async (transaction) => {
        const challengeSnapshot =
          await transaction.get(
            challengeRef,
          );

        if (
          !challengeSnapshot.exists
        ) {
          return null;
        }

        const data =
          challengeSnapshot.data();

        const expiresAt =
          readTimestamp(
            data?.expiresAt,
          );

        const createdByAdminUid =
          typeof data?.createdByAdminUid ===
            "string"
            ? data.createdByAdminUid
            : null;

        if (
          !expiresAt ||
          !createdByAdminUid ||
          data?.usedAt ||
          expiresAt.toMillis() <=
            Date.now()
        ) {
          return null;
        }

        const credential =
          buildStoreDeviceCredential({
            name:
              input.deviceName,

            pairedByAdminUid:
              createdByAdminUid,
          });

        const deviceRef =
          getStoreDeviceDocumentReference(
            credential.deviceId,
          );

        transaction.set(
          deviceRef,
          credential.data,
        );

        transaction.update(
          challengeRef,
          {
            usedAt:
              credential.now,

            usedByDeviceId:
              credential.deviceId,
          },
        );

        return {
          deviceId:
            credential.deviceId,

          cookieValue:
            credential.cookieValue,
        };
      },
    );

  if (result) {
    await clearPairingAttempts(
      input.fingerprint,
    );
  }

  return result;
}
