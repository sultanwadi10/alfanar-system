import "server-only";

import { firebaseAdminEnvSchema } from "./env";

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