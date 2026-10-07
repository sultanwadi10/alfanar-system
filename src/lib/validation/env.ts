import { z } from "zod";

export const firebaseClientEnvSchema = z.object({
  NEXT_PUBLIC_FIREBASE_API_KEY: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_APP_ID: z.string().min(1),
});

export const firebaseAdminEnvSchema = z.object({
  FIREBASE_ADMIN_PROJECT_ID: z.string().min(1),
  FIREBASE_ADMIN_CLIENT_EMAIL: z.string().email(),
  FIREBASE_ADMIN_PRIVATE_KEY: z.string().min(1),
});

export type FirebaseClientEnv = z.infer<
  typeof firebaseClientEnvSchema
>;

export type FirebaseAdminEnv = z.infer<
  typeof firebaseAdminEnvSchema
>;

export const securityEnvSchema = z.object({
  EMPLOYEE_PIN_PEPPER: z.string().min(64),
});

export type SecurityEnv =
  z.infer<typeof securityEnvSchema>;