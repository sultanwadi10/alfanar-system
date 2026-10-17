export const EMPLOYEE_SHIFT_TYPES = {
  MORNING: "MORNING",
  EVENING: "EVENING",
} as const;

export type EmployeeShiftType =
  (typeof EMPLOYEE_SHIFT_TYPES)[keyof typeof EMPLOYEE_SHIFT_TYPES];

export const EMPLOYEE_WEEKDAYS = {
  SUNDAY: "sunday",
  MONDAY: "monday",
  TUESDAY: "tuesday",
  WEDNESDAY: "wednesday",
  THURSDAY: "thursday",
  FRIDAY: "friday",
  SATURDAY: "saturday",
} as const;

export type EmployeeWeekday =
  (typeof EMPLOYEE_WEEKDAYS)[keyof typeof EMPLOYEE_WEEKDAYS];

export type EmployeeSchedule = Record<
  EmployeeWeekday,
  EmployeeShiftType[]
>;

export type EmployeeShiftTimeSettings = {
  morningStart: string;
  morningEnd: string;

  eveningStart: string;
  eveningEnd: string;
};