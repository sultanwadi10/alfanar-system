import "server-only";

import type { DecodedIdToken } from "firebase-admin/auth";

import { getFirebaseAdminAuth } from "@/lib/firebase/admin";

export async function verifyFirebaseIdToken(
  idToken: string,
): Promise<DecodedIdToken> {
  return getFirebaseAdminAuth().verifyIdToken(idToken);
}