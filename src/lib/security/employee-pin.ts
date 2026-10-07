import "server-only";

import {
  createHmac,
  randomBytes,
  scrypt,
  timingSafeEqual,
} from "node:crypto";

import { getSecurityEnv } from "@/lib/validation/server-env";

const PIN_HASH_VERSION = "v1";

const SCRYPT_N = 131072;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

const SCRYPT_KEY_LENGTH = 32;
const SALT_LENGTH = 16;

const SCRYPT_MAX_MEMORY =
  256 * 1024 * 1024;

function applyPinPepper(pin: string): Buffer {
  const { EMPLOYEE_PIN_PEPPER } =
    getSecurityEnv();

  return createHmac(
    "sha256",
    EMPLOYEE_PIN_PEPPER,
  )
    .update(pin)
    .digest();
}

function deriveKey(
  value: Buffer,
  salt: Buffer,
  keyLength: number,
  options: {
    N: number;
    r: number;
    p: number;
    maxmem: number;
  },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      value,
      salt,
      keyLength,
      options,
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(derivedKey);
      },
    );
  });
}

export async function hashEmployeePin(
  pin: string,
): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);

  const pepperedPin =
    applyPinPepper(pin);

  const derivedKey = await deriveKey(
    pepperedPin,
    salt,
    SCRYPT_KEY_LENGTH,
    {
      N: SCRYPT_N,
      r: SCRYPT_R,
      p: SCRYPT_P,
      maxmem: SCRYPT_MAX_MEMORY,
    },
  );

  return [
    "scrypt",
    PIN_HASH_VERSION,
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("hex"),
    derivedKey.toString("hex"),
  ].join("$");
}

export async function verifyEmployeePin(
  pin: string,
  storedHash: string,
): Promise<boolean> {
  const parts = storedHash.split("$");

  if (parts.length !== 7) {
    return false;
  }

  const [
    algorithm,
    version,
    nValue,
    rValue,
    pValue,
    saltHex,
    hashHex,
  ] = parts;

  if (
    algorithm !== "scrypt" ||
    version !== PIN_HASH_VERSION
  ) {
    return false;
  }

  const N = Number(nValue);
  const r = Number(rValue);
  const p = Number(pValue);

  if (
    !Number.isInteger(N) ||
    !Number.isInteger(r) ||
    !Number.isInteger(p)
  ) {
    return false;
  }

  const salt =
    Buffer.from(saltHex, "hex");

  const expectedHash =
    Buffer.from(hashHex, "hex");

  if (
    salt.length !== SALT_LENGTH ||
    expectedHash.length !==
      SCRYPT_KEY_LENGTH
  ) {
    return false;
  }

  const pepperedPin =
    applyPinPepper(pin);

  const actualHash = await deriveKey(
    pepperedPin,
    salt,
    expectedHash.length,
    {
      N,
      r,
      p,
      maxmem: SCRYPT_MAX_MEMORY,
    },
  );

  return timingSafeEqual(
    expectedHash,
    actualHash,
  );
}