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

const customerFields = {
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
};

export const createCustomerSchema =
  z.object(customerFields);

export const updateCustomerSchema =
  z.object(customerFields);

export type CreateCustomerInput =
  z.infer<
    typeof createCustomerSchema
  >;

export type UpdateCustomerInput =
  z.infer<
    typeof updateCustomerSchema
  >;

  export const creditCustomerCouponsSchema =
  z.object({
    amount: z
      .number()
      .int(
        "عدد الكوبونات يجب أن يكون رقمًا صحيحًا.",
      )
      .min(
        1,
        "يجب إضافة كوبون واحد على الأقل.",
      )
      .max(
        22,
        "لا يمكن إضافة أكثر من 22 كوبون في العملية.",
      ),

    reason: z
      .string()
      .trim()
      .min(
        2,
        "اكتب سبب إضافة الكوبونات.",
      )
      .max(
        200,
        "سبب العملية طويل جدًا.",
      ),
  });

export type CreditCustomerCouponsInput =
  z.infer<
    typeof creditCustomerCouponsSchema
  >;