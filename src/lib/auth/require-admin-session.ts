import "server-only";

import type { DecodedIdToken } from "firebase-admin/auth";

import { getVerifiedAdminSession } from "@/lib/auth/get-verified-admin-session";

export async function requireAdminSession(): Promise<DecodedIdToken> {
  return getVerifiedAdminSession();
}