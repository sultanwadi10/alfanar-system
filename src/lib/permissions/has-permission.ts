import type { Permission } from "@/types/permissions";
import type { UserRole } from "@/types/roles";

import { ROLE_PERMISSIONS } from "./role-permissions";

export function hasPermission(
  role: UserRole,
  permission: Permission,
): boolean {
  const permissions =
    ROLE_PERMISSIONS[role] as readonly Permission[];

  return permissions.includes(permission);
}