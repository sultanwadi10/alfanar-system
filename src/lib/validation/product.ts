import { z } from "zod";

export const productMutationSchema =
  z.object({
    name: z
      .string()
      .trim()
      .min(
        2,
        "اسم المنتج قصير جدًا.",
      )
      .max(
        120,
        "اسم المنتج طويل جدًا.",
      ),

    category: z.enum([
      "REFILL",
      "NEW_BOTTLE",
      "CUPS",
      "SHRINK",
      "COOLED",
      "OTHER",
    ]),

    storePriceFils: z
      .number()
      .int(
        "سعر المحل غير صالح.",
      )
      .min(
        0,
        "سعر المحل لا يمكن أن يكون سالبًا.",
      )
      .max(
        10_000_000,
        "سعر المحل غير صالح.",
      ),

    deliveryPriceFils: z
      .number()
      .int(
        "سعر التوصيل غير صالح.",
      )
      .min(
        0,
        "سعر التوصيل لا يمكن أن يكون سالبًا.",
      )
      .max(
        10_000_000,
        "سعر التوصيل غير صالح.",
      ),

    isActive: z.boolean(),

    showForEmployee:
      z.boolean(),

    showForCustomerApp:
      z.boolean(),

    requiresBottleOrigin:
      z.boolean(),

    imageUrl: z
      .string()
      .url()
      .max(2048)
      .nullable(),
  });

export type ProductMutationInput =
  z.infer<
    typeof productMutationSchema
  >;