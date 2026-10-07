import { z } from "zod";

export const employeeNameSchema = z
  .string()
  .trim()
  .min(2)
  .max(100);

export const employeePinSchema = z
  .string()
  .regex(/^\d{4,6}$/);

export const createEmployeeSchema = z.object({
  name: employeeNameSchema,
  pin: employeePinSchema,
});

export const updateEmployeeStatusSchema = z.object({
  isActive: z.boolean(),
});

export const resetEmployeePinSchema = z.object({
  pin: employeePinSchema,
});

export type CreateEmployeeInput =
  z.infer<typeof createEmployeeSchema>;

export type UpdateEmployeeStatusInput =
  z.infer<typeof updateEmployeeStatusSchema>;

export type ResetEmployeePinInput =
  z.infer<typeof resetEmployeePinSchema>;