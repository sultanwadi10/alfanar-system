import {
  getShiftTimeSettings,
  listEmployeeSchedules,
} from "@/lib/employees/employee-schedule-repository";
import { listEmployees } from "@/lib/employees/employee-repository";

import { EmployeesManager } from "./employees-manager";

export default async function EmployeesPage() {
  const employees =
    await listEmployees();

  const [
    schedules,
    shiftSettings,
  ] =
    await Promise.all([
      listEmployeeSchedules(
        employees.map(
          (employee) =>
            employee.id,
        ),
      ),

      getShiftTimeSettings(),
    ]);

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
      employees={
        safeEmployees
      }
      schedules={
        schedules
      }
      shiftSettings={
        shiftSettings
      }
    />
  );
}