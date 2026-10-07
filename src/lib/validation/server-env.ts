import "server-only";

import {
  firebaseAdminEnvSchema,
  securityEnvSchema,
} from "@/lib/validation/env";

export function getFirebaseAdminEnv() {
  return firebaseAdminEnvSchema.parse({
    FIREBASE_ADMIN_PROJECT_ID:
      process.env.FIREBASE_ADMIN_PROJECT_ID,

    FIREBASE_ADMIN_CLIENT_EMAIL:
      process.env.FIREBASE_ADMIN_CLIENT_EMAIL,

    FIREBASE_ADMIN_PRIVATE_KEY:
      process.env.FIREBASE_ADMIN_PRIVATE_KEY,
  });
}

export function getSecurityEnv() {
  return securityEnvSchema.parse({
    EMPLOYEE_PIN_PEPPER:
      process.env.EMPLOYEE_PIN_PEPPER,
  });
}