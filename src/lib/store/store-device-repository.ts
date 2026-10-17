import "server-only";

import {
  createHash,
  randomBytes,
  randomUUID,
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
import {
  SecurityError,
} from "@/lib/security/security-error";
import {
  SECURITY_ERROR_CODES,
} from "@/lib/security/security-error-codes";
import {
  STORE_DEVICE_CONFIG,
} from "@/lib/store/store-device-config";

const STORE_DEVICES_COLLECTION =
  "storeDevices";

export type StoreDeviceRecord = {
  id: string;
  name: string;
  createdAt: Date;
  lastSeenAt: Date;
  revokedAt: Date | null;
};

type StoreDeviceCredential = {
  device:
    StoreDeviceRecord;

  cookieValue:
    string;
};

function getStoreDevicesCollection() {
  return getFirebaseAdminFirestore()
    .collection(
      STORE_DEVICES_COLLECTION,
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
): Date | null {
  if (
    value instanceof Timestamp
  ) {
    return value.toDate();
  }

  return null;
}

function parseDevice(
  id: string,
  data:
    DocumentData,
): StoreDeviceRecord | null {
  const createdAt =
    readTimestamp(
      data.createdAt,
    );

  const lastSeenAt =
    readTimestamp(
      data.lastSeenAt,
    ) ??
    createdAt;

  if (
    typeof data.name !==
      "string" ||
    !createdAt ||
    !lastSeenAt
  ) {
    return null;
  }

  return {
    id,

    name:
      data.name,

    createdAt,

    lastSeenAt,

    revokedAt:
      readTimestamp(
        data.revokedAt,
      ),
  };
}

function parseCookieValue(
  value: string,
) {
  const parts =
    value.split(".");

  if (
    parts.length !== 3 ||
    parts[0] !==
      STORE_DEVICE_CONFIG.COOKIE_VERSION ||
    !parts[1] ||
    !parts[2]
  ) {
    return null;
  }

  return {
    deviceId:
      parts[1],

    token:
      parts[2],
  };
}

function hashesMatch(
  leftHex: string,
  rightHex: string,
) {
  try {
    const left =
      Buffer.from(
        leftHex,
        "hex",
      );

    const right =
      Buffer.from(
        rightHex,
        "hex",
      );

    return (
      left.length ===
        right.length &&
      left.length > 0 &&
      timingSafeEqual(
        left,
        right,
      )
    );
  } catch {
    return false;
  }
}

export function buildStoreDeviceCredential(
  input: {
    name: string;
    pairedByAdminUid: string;
  },
) {
  const deviceId =
    randomUUID();

  const token =
    randomBytes(
      STORE_DEVICE_CONFIG
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

  const cookieValue =
    [
      STORE_DEVICE_CONFIG
        .COOKIE_VERSION,
      deviceId,
      token,
    ].join(".");

  return {
    deviceId,
    tokenHash,
    cookieValue,
    now,

    data: {
      name:
        input.name,

      tokenHash,

      createdAt:
        now,

      lastSeenAt:
        now,

      pairedByAdminUid:
        input.pairedByAdminUid,

      revokedAt:
        null,

      revokedByAdminUid:
        null,
    },
  };
}

export async function resolvePairedStoreDevice(): Promise<StoreDeviceRecord | null> {
  const cookieStore =
    await cookies();

  const rawCookie =
    cookieStore.get(
      STORE_DEVICE_CONFIG
        .COOKIE_NAME,
    )?.value;

  if (!rawCookie) {
    return null;
  }

  const parsedCookie =
    parseCookieValue(
      rawCookie,
    );

  if (!parsedCookie) {
    return null;
  }

  const ref =
    getStoreDevicesCollection()
      .doc(
        parsedCookie.deviceId,
      );

  const snapshot =
    await ref.get();

  if (!snapshot.exists) {
    return null;
  }

  const data =
    snapshot.data();

  if (
    !data ||
    typeof data.tokenHash !==
      "string" ||
    data.revokedAt
  ) {
    return null;
  }

  const presentedHash =
    hashValue(
      parsedCookie.token,
    );

  if (
    !hashesMatch(
      data.tokenHash,
      presentedHash,
    )
  ) {
    return null;
  }

  const device =
    parseDevice(
      snapshot.id,
      data,
    );

  if (!device) {
    return null;
  }

  if (
    Date.now() -
      device.lastSeenAt.getTime() >=
    STORE_DEVICE_CONFIG
      .LAST_SEEN_UPDATE_INTERVAL_MS
  ) {
    try {
      const now =
        Timestamp.now();

      await ref.update({
        lastSeenAt:
          now,
      });

      device.lastSeenAt =
        now.toDate();
    } catch {
      // A last-seen write must never be the security authority.
    }
  }

  return device;
}

export async function requirePairedStoreDevice(): Promise<StoreDeviceRecord> {
  const device =
    await resolvePairedStoreDevice();

  if (!device) {
    throw new SecurityError(
      SECURITY_ERROR_CODES.INVALID_SESSION,
      "Store device is not authorized.",
      401,
    );
  }

  return device;
}

export async function listStoreDevices(): Promise<StoreDeviceRecord[]> {
  const snapshot =
    await getStoreDevicesCollection()
      .orderBy(
        "createdAt",
        "desc",
      )
      .limit(50)
      .get();

  return snapshot.docs
    .map((doc) => {
      const data =
        doc.data();

      return parseDevice(
        doc.id,
        data,
      );
    })
    .filter(
      (
        device,
      ): device is StoreDeviceRecord =>
        device !== null,
    );
}

export async function revokeStoreDevice(
  deviceId: string,
  adminAuthUid: string,
) {
  const ref =
    getStoreDevicesCollection()
      .doc(
        deviceId,
      );

  const snapshot =
    await ref.get();

  if (!snapshot.exists) {
    return false;
  }

  await ref.update({
    revokedAt:
      Timestamp.now(),

    revokedByAdminUid:
      adminAuthUid,
  });

  return true;
}

export function getStoreDeviceDocumentReference(
  deviceId: string,
) {
  return getStoreDevicesCollection()
    .doc(
      deviceId,
    );
}

export type {
  StoreDeviceCredential,
};
