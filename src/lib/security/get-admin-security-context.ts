import "server-only";

import { requireAdminSession } from "@/lib/auth/require-admin-session";
import {
  SECURITY_CONTEXT_TYPES,
  type AdminSecurityContext,
} from "@/types/security-context";
import { USER_ROLES } from "@/types/roles";

export async function getAdminSecurityContext(): Promise<AdminSecurityContext> {
  const session = await requireAdminSession();

  return {
    contextType: SECURITY_CONTEXT_TYPES.ADMIN,
    authUid: session.uid,
    principalType: "ADMIN_ACCOUNT",
    role: USER_ROLES.ADMIN,
  };
}