import type { UserRole } from "./roles";

export type SecurityContext = {
  authUid: string;
  role: UserRole;

  employeeId?: string;
  shiftId?: string;
};