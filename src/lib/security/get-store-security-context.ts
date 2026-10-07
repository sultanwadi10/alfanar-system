import "server-only";

import { requireStoreSession } from "@/lib/auth/require-store-session";
import {
  SECURITY_CONTEXT_TYPES,
  type StoreSecurityContext,
} from "@/types/security-context";

export async function getStoreSecurityContext(): Promise<StoreSecurityContext> {
  const session = await requireStoreSession();

  return {
    contextType: SECURITY_CONTEXT_TYPES.STORE,
    authUid: session.uid,
    principalType: "STORE_ACCOUNT",
  };
}