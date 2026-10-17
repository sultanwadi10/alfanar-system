import { z } from "zod";

import { EMPLOYEE_SHIFT_TYPES } from "@/types/employee-schedule";

const shiftSchema =
  z.enum([
    EMPLOYEE_SHIFT_TYPES.MORNING,
    EMPLOYEE_SHIFT_TYPES.EVENING,
  ]);

const dayScheduleSchema =
  z
    .array(
      shiftSchema,
    )
    .max(2)
    .refine(
      (values) =>
        new Set(
          values,
        ).size ===
        values.length,
      {
        message:
          "لا يمكن تكرار نفس الشفت في اليوم.",
      },
    );

export const employeeScheduleSchema =
  z.object({
    sunday:
      dayScheduleSchema,

    monday:
      dayScheduleSchema,

    tuesday:
      dayScheduleSchema,

    wednesday:
      dayScheduleSchema,

    thursday:
      dayScheduleSchema,

    friday:
      dayScheduleSchema,

    saturday:
      dayScheduleSchema,
  });

const timeSchema =
  z
    .string()
    .regex(
      /^(?:[01]\d|2[0-3]):[0-5]\d$/,
      "صيغة الوقت غير صالحة.",
    );

export const shiftTimeSettingsSchema =
  z
    .object({
      morningStart:
        timeSchema,

      morningEnd:
        timeSchema,

      eveningStart:
        timeSchema,

      eveningEnd:
        timeSchema,
    })
    .refine(
      (value) =>
        value.morningStart !==
        value.morningEnd,
      {
        message:
          "بداية ونهاية الشفت الصباحي لا يمكن أن تكونا نفس الوقت.",
      },
    )
    .refine(
      (value) =>
        value.eveningStart !==
        value.eveningEnd,
      {
        message:
          "بداية ونهاية الشفت المسائي لا يمكن أن تكونا نفس الوقت.",
      },
    );