import "server-only";
import { operatorSessionExpiry } from "./operator-session-lifetime";
import { OPERATOR_SESSION_CUTOFFS, operatorSessionCutoffId } from "./operator-session-cutoff";

import {
  createHash,
  randomBytes,
} from "node:crypto";

import { Timestamp } from "firebase-admin/firestore";
import { cookies } from "next/headers";

import { OPERATOR_SESSION_CONFIG } from "@/lib/auth/operator-session-config";
import {
  getEmployeeAuthRecord,
  type EmployeeAuthRecord,
} from "@/lib/employees/employee-repository";
import { getFirebaseAdminFirestore } from "@/lib/firebase/admin";

const OPERATOR_SESSIONS_COLLECTION =
  "operatorSessions";

type OperatorSessionRecord = {
  authVersion?: number;
  storeAuthUid: string;

  employeeId: string;

  employeeNameSnapshot: string;

  createdAt: Timestamp;

  expiresAt: Timestamp;

  revokedAt:
    | Timestamp
    | null;
};

export type ResolvedOperatorSession =
  {
    employeeId: string;

    employeeName: string;

    storeAuthUid: string;

    expiresAt: Date;
  };

function hashToken(
  token: string,
) {
  return createHash(
    "sha256",
  )
    .update(token)
    .digest("hex");
}

export async function createOperatorSession(
  storeAuthUid: string,
  employee: EmployeeAuthRecord,
): Promise<{
  token: string;
  expiresAt: Date;
}> {
  const firestore =
    getFirebaseAdminFirestore();

  const token =
    randomBytes(
      32,
    ).toString(
      "base64url",
    );

  const tokenHash =
    hashToken(
      token,
    );

  const now =
    Timestamp.now();

  const expiresAt =
    Timestamp.fromMillis(
      Date.now() +
        OPERATOR_SESSION_CONFIG.EXPIRES_IN_MS,
    );

  const record: OperatorSessionRecord =
    {
      storeAuthUid,
      authVersion: employee.authVersion ?? 0,

      employeeId:
        employee.id,

      employeeNameSnapshot:
        employee.name,

      createdAt:
        now,

      expiresAt,

      revokedAt:
        null,
    };

  await firestore
    .collection(
      OPERATOR_SESSIONS_COLLECTION,
    )
    .doc(
      tokenHash,
    )
    .set(
      record,
    );

  return {
    token,

    expiresAt:
      expiresAt.toDate(),
  };
}

export async function resolveOperatorSession(
  storeAuthUid: string,
  options: { handoverOnly?: boolean } = {},
): Promise<ResolvedOperatorSession | null> {
  const cookieStore =
    await cookies();

  const token =
    cookieStore.get(
      OPERATOR_SESSION_CONFIG.COOKIE_NAME,
    )?.value;

  if (!token) {
    return null;
  }

  const firestore =
    getFirebaseAdminFirestore();

  const reference =
    firestore
      .collection(
        OPERATOR_SESSIONS_COLLECTION,
      )
      .doc(
        hashToken(
          token,
        ),
      );

  const snapshot =
    await reference.get();

  if (!snapshot.exists) {
    return null;
  }

  const record =
    snapshot.data() as OperatorSessionRecord;
  const expiresAt=record.createdAt instanceof Timestamp&&record.expiresAt instanceof Timestamp?operatorSessionExpiry(record.createdAt.toMillis(),record.expiresAt.toMillis()):0;

  if (
    record.revokedAt ||
    record.storeAuthUid !==
      storeAuthUid ||
    expiresAt<=Date.now()
  ) {
    return null;
  }

  // One successful handover invalidates all older sessions for this employee in this store.
  const cutoff=(await firestore.collection(OPERATOR_SESSION_CUTOFFS).doc(operatorSessionCutoffId(storeAuthUid,record.employeeId)).get()).data()?.invalidBefore;
  if(cutoff instanceof Timestamp && (!(record.createdAt instanceof Timestamp) || record.createdAt.toMillis()<=cutoff.toMillis()))return null;

  const employee =
    await getEmployeeAuthRecord(
      record.employeeId,
    );

  if (
    !employee ||
    !employee.isActive ||
    (record.authVersion ?? 0) !== (employee.authVersion ?? 0)
  ) {
    await reference.update({
      revokedAt:
        Timestamp.now(),
    });

    return null;
  }

  /*
   * مهم:
   * الجدول يعاد فحصه عند كل Resolve.
   *
   * انتهاء الدوام يمنع العمليات، مع السماح لنقطة التسليم فقط
   * بالتحقق من صاحب الشفت المفتوح. لا تمديد لعمر الجلسة.
   */
  // Roster times are advisory. A shift stays usable until an explicit handover.
  // Expiry, employee activation, PIN version and handover revocation still apply.
  void options;

  return {
    employeeId:
      employee.id,

    employeeName:
      employee.name,

    storeAuthUid,

    expiresAt:
      new Date(expiresAt),
  };
}

export async function revokeCurrentOperatorSession(): Promise<void> {
  const cookieStore =
    await cookies();

  const token =
    cookieStore.get(
      OPERATOR_SESSION_CONFIG.COOKIE_NAME,
    )?.value;

  if (!token) {
    return;
  }

  const firestore =
    getFirebaseAdminFirestore();

  const reference =
    firestore
      .collection(
        OPERATOR_SESSIONS_COLLECTION,
      )
      .doc(
        hashToken(
          token,
        ),
      );

  const snapshot =
    await reference.get();

  if (!snapshot.exists) {
    return;
  }

  await reference.update({
    revokedAt:
      Timestamp.now(),
  });
}
