import { z } from "zod";

export const operatorLoginSchema =
  z.object({
    employeeId: z
      .string()
      .trim()
      .min(1)
      .max(128),

    pin: z
      .string()
      .regex(
        /^\d{4,6}$/,
        "رمز PIN يجب أن يكون من 4 إلى 6 أرقام.",
      ),
  });