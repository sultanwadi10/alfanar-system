import { getWageSettings } from "@/lib/employees/wage-settings";
import { getAdminSecurityContext } from "@/lib/security/get-admin-security-context";
import { isSecurityError } from "@/lib/security/is-security-error";
import { redirect } from "next/navigation";
import { getRosterWeek } from "@/lib/employees/roster-repository";
import { listEmployees } from "@/lib/employees/employee-repository";

import { EmployeesManager } from "./employees-manager";

export default async function EmployeesPage() {
  try { await getAdminSecurityContext(); }
  catch (error) { if (isSecurityError(error)) redirect("/login?target=admin"); throw error; }
  const wageSettings = await getWageSettings();
  const employees =
    await listEmployees();

  const initialRoster = await getRosterWeek();

  const safeEmployees =
    employees.map(
      (employee) => ({
        id:
          employee.id,

        name:
          employee.name,

        isActive:
          employee.isActive,

        createdAt:
          employee.createdAt.toISOString(),
      }),
    );

  return (
    <EmployeesManager
      wageSettings={wageSettings}
      employees={
        safeEmployees
      }
      initialRoster={initialRoster}
    />
  );
}
