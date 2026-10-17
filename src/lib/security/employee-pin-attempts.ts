import "server-only";

import { createHash } from "node:crypto";

import { Timestamp } from "firebase-admin/firestore";

import { OPERATOR_SESSION_CONFIG } from "@/lib/auth/operator-session-config";
import { getFirebaseAdminFirestore } from "@/lib/firebase/admin";

const PIN_ATTEMPTS_COLLECTION =
  "employeePinAttempts";

type PinAttemptRecord = {
  failedAttempts: number;

  lockedUntil:
    | Timestamp
    | null;

  updatedAt: Timestamp;
};

function getAttemptDocumentId(
  storeAuthUid: string,
  employeeId: string,
) {
  return createHash(
    "sha256",
  )
    .update(
      `${storeAuthUid}:${employeeId}`,
    )
    .digest("hex");
}

export async function getPinLockState(
  storeAuthUid: string,
  employeeId: string,
): Promise<{
  locked: boolean;
  remainingSeconds: number;
}> {
  const firestore =
    getFirebaseAdminFirestore();

  const snapshot =
    await firestore
      .collection(
        PIN_ATTEMPTS_COLLECTION,
      )
      .doc(
        getAttemptDocumentId(
          storeAuthUid,
          employeeId,
        ),
      )
      .get();

  if (!snapshot.exists) {
    return {
      locked: false,
      remainingSeconds: 0,
    };
  }

  const record =
    snapshot.data() as PinAttemptRecord;

  if (!record.lockedUntil) {
    return {
      locked: false,
      remainingSeconds: 0,
    };
  }

  const remainingMs =
    record.lockedUntil.toMillis() -
    Date.now();

  if (remainingMs <= 0) {
    return {
      locked: false,
      remainingSeconds: 0,
    };
  }

  return {
    locked: true,

    remainingSeconds:
      Math.ceil(
        remainingMs / 1000,
      ),
  };
}

export async function registerFailedPinAttempt(
  storeAuthUid: string,
  employeeId: string,
): Promise<{
  locked: boolean;
}> {
  const firestore =
    getFirebaseAdminFirestore();

  const reference =
    firestore
      .collection(
        PIN_ATTEMPTS_COLLECTION,
      )
      .doc(
        getAttemptDocumentId(
          storeAuthUid,
          employeeId,
        ),
      );

  return firestore.runTransaction(
    async (transaction) => {
      const snapshot =
        await transaction.get(
          reference,
        );

      const nowMs =
        Date.now();

      let failedAttempts = 0;

      let existingLock:
        | Timestamp
        | null = null;

      if (snapshot.exists) {
        const record =
          snapshot.data() as PinAttemptRecord;

        failedAttempts =
          record.failedAttempts ??
          0;

        existingLock =
          record.lockedUntil ??
          null;

        if (
          existingLock &&
          existingLock.toMillis() >
            nowMs
        ) {
          return {
            locked: true,
          };
        }

        if (
          existingLock &&
          existingLock.toMillis() <=
            nowMs
        ) {
          failedAttempts = 0;
        }
      }

      const nextAttempts =
        failedAttempts + 1;

      const shouldLock =
        nextAttempts >=
        OPERATOR_SESSION_CONFIG.MAX_PIN_ATTEMPTS;

      const lockedUntil =
        shouldLock
          ? Timestamp.fromMillis(
              nowMs +
                OPERATOR_SESSION_CONFIG.PIN_LOCK_MS,
            )
          : null;

      const record: PinAttemptRecord =
        {
          failedAttempts:
            nextAttempts,

          lockedUntil,

          updatedAt:
            Timestamp.now(),
        };

      transaction.set(
        reference,
        record,
      );

      return {
        locked:
          shouldLock,
      };
    },
  );
}

export async function clearFailedPinAttempts(
  storeAuthUid: string,
  employeeId: string,
): Promise<void> {
  const firestore =
    getFirebaseAdminFirestore();

  await firestore
    .collection(
      PIN_ATTEMPTS_COLLECTION,
    )
    .doc(
      getAttemptDocumentId(
        storeAuthUid,
        employeeId,
      ),
    )
    .delete();
}