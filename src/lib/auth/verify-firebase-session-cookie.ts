import "server-only";

import type { DecodedIdToken } from "firebase-admin/auth";

import { getFirebaseAdminAuth } from "@/lib/firebase/admin";

export async function verifyFirebaseSessionCookie(
  sessionCookie: string,
): Promise<DecodedIdToken> {
  return getFirebaseAdminAuth().verifySessionCookie(
    sessionCookie,
    true,
  );
}