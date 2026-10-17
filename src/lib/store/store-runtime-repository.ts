import "server-only";

import {
  Timestamp,
} from "firebase-admin/firestore";

import {
  getFirebaseAdminFirestore,
} from "@/lib/firebase/admin";

export const STORE_RUNTIME_STATUSES = {
  RUNNING: "RUNNING",
  STOPPED: "STOPPED",
} as const;

export type StoreRuntimeStatus =
  (typeof STORE_RUNTIME_STATUSES)[keyof typeof STORE_RUNTIME_STATUSES];

export type StoreRuntimeState = {
  status: StoreRuntimeStatus;

  sessionInvalidBefore:
    Date | null;

  updatedAt:
    Date | null;
};

const STORE_RUNTIME_COLLECTION =
  "systemSettings";

const STORE_RUNTIME_DOCUMENT =
  "storeRuntime";

function getStoreRuntimeDocument() {
  return getFirebaseAdminFirestore()
    .collection(
      STORE_RUNTIME_COLLECTION,
    )
    .doc(
      STORE_RUNTIME_DOCUMENT,
    );
}

function readTimestamp(
  value: unknown,
): Date | null {
  if (
    value instanceof Timestamp
  ) {
    return value.toDate();
  }

  return null;
}

function parseRuntimeState(
  data:
    | FirebaseFirestore.DocumentData
    | undefined,
): StoreRuntimeState {
  /*
   * Migration-safe default:
   *
   * قبل إنشاء وثيقة الإعداد لأول مرة،
   * النظام الحالي يبقى شغال.
   */
  if (!data) {
    return {
      status:
        STORE_RUNTIME_STATUSES.RUNNING,

      sessionInvalidBefore:
        null,

      updatedAt:
        null,
    };
  }

  const status =
    data.status ===
    STORE_RUNTIME_STATUSES.STOPPED
      ? STORE_RUNTIME_STATUSES.STOPPED
      : STORE_RUNTIME_STATUSES.RUNNING;

  return {
    status,

    sessionInvalidBefore:
      readTimestamp(
        data.sessionInvalidBefore,
      ),

    updatedAt:
      readTimestamp(
        data.updatedAt,
      ),
  };
}

export async function getStoreRuntimeState(): Promise<StoreRuntimeState> {
  const snapshot =
    await getStoreRuntimeDocument().get();

  return parseRuntimeState(
    snapshot.exists
      ? snapshot.data()
      : undefined,
  );
}

export async function stopStoreRuntime(): Promise<StoreRuntimeState> {
  const now =
    Timestamp.now();

  /*
   * sessionInvalidBefore هي قلب الـKill Switch.
   *
   * أي Store Session أقدم من لحظة الإيقاف
   * تبقى ميتة حتى بعد إعادة تشغيل النظام.
   */
  await getStoreRuntimeDocument().set(
    {
      status:
        STORE_RUNTIME_STATUSES.STOPPED,

      sessionInvalidBefore:
        now,

      updatedAt:
        now,
    },
    {
      merge: true,
    },
  );

  return {
    status:
      STORE_RUNTIME_STATUSES.STOPPED,

    sessionInvalidBefore:
      now.toDate(),

    updatedAt:
      now.toDate(),
  };
}

export async function startStoreRuntime(): Promise<StoreRuntimeState> {
  const now =
    Timestamp.now();

  /*
   * مهم:
   *
   * لا نمسح sessionInvalidBefore.
   *
   * هذا يمنع أي جلسة قديمة تم إبطالها
   * أثناء STOP من العودة للحياة.
   */
  await getStoreRuntimeDocument().set(
    {
      status:
        STORE_RUNTIME_STATUSES.RUNNING,

      updatedAt:
        now,
    },
    {
      merge: true,
    },
  );

  const state =
    await getStoreRuntimeState();

  return state;
}

export function isStoreSessionAllowed(
  runtime:
    StoreRuntimeState,

  sessionIssuedAtSeconds:
    number,
) {
  if (
    runtime.status ===
    STORE_RUNTIME_STATUSES.STOPPED
  ) {
    return false;
  }

  if (
    !runtime.sessionInvalidBefore
  ) {
    return true;
  }

  const sessionIssuedAtMs =
    sessionIssuedAtSeconds *
    1000;

  return (
    sessionIssuedAtMs >
    runtime.sessionInvalidBefore.getTime()
  );
}