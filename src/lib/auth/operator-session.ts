import "server-only";

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
import { getEmployeeCurrentScheduleAccess } from "@/lib/employees/employee-schedule-repository";
import { getFirebaseAdminFirestore } from "@/lib/firebase/admin";

const OPERATOR_SESSIONS_COLLECTION =
  "operatorSessions";

type OperatorSessionRecord = {
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

function isExpired(
  timestamp: Timestamp,
) {
  return (
    timestamp.toMillis() <=
    Date.now()
  );
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

  if (
    record.revokedAt ||
    record.storeAuthUid !==
      storeAuthUid ||
    isExpired(
      record.expiresAt,
    )
  ) {
    return null;
  }

  const employee =
    await getEmployeeAuthRecord(
      record.employeeId,
    );

  if (
    !employee ||
    !employee.isActive
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
   * يعني لو انتهى دوام الموظف،
   * أو الأدمن غيّر جدوله أثناء الجلسة،
   * لا تبقى الجلسة صالحة تشغيليًا.
   */
  const scheduleAccess =
    await getEmployeeCurrentScheduleAccess(
      employee.id,
    );

  if (
    !scheduleAccess.allowed
  ) {
    await reference.update({
      revokedAt:
        Timestamp.now(),
    });

    return null;
  }

  return {
    employeeId:
      employee.id,

    employeeName:
      employee.name,

    storeAuthUid,

    expiresAt:
      record.expiresAt.toDate(),
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