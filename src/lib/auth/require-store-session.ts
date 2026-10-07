import "server-only";

import type { DecodedIdToken } from "firebase-admin/auth";

import { getVerifiedStoreSession } from "@/lib/auth/get-verified-store-session";

export async function requireStoreSession(): Promise<DecodedIdToken> {
  return getVerifiedStoreSession();
}