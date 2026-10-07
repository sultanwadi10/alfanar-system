import "server-only";

import { getFirebaseAdminAuth } from "@/lib/firebase/admin";

export async function createFirebaseSessionCookie(
  idToken: string,
  expiresInMs: number,
): Promise<string> {
  return getFirebaseAdminAuth().createSessionCookie(idToken, {
    expiresIn: expiresInMs,
  });
}