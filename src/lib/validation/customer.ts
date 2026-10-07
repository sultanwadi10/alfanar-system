import { z } from "zod";

import { normalizeJordanPhone } from "@/lib/customers/customer-phone";

export const customerNameSchema = z
  .string()
  .trim()
  .min(
    2,
    "اسم العميل يجب أن يحتوي على حرفين على الأقل.",
  )
  .max(
    100,
    "اسم العميل طويل جدًا.",
  );

export const customerPhoneSchema = z
  .string()
  .trim()
  .min(
    1,
    "رقم الهاتف مطلوب.",
  )
  .superRefine((value, context) => {
    if (!normalizeJordanPhone(value)) {
      context.addIssue({
        code: "custom",
        message:
          "أدخل رقم هاتف أردني صحيح.",
      });
    }
  })
  .transform(
    (value) =>
      normalizeJordanPhone(value)!,
  );

export const createCustomerSchema =
  z.object({
    name: customerNameSchema,

    phone: customerPhoneSchema,

    primaryAddress: z
      .string()
      .trim()
      .max(
        250,
        "العنوان طويل جدًا.",
      )
      .default(""),

    adminNotes: z
      .string()
      .trim()
      .max(
        1000,
        "الملاحظات طويلة جدًا.",
      )
      .default(""),
  });

export type CreateCustomerInput =
  z.infer<
    typeof createCustomerSchema
  >;