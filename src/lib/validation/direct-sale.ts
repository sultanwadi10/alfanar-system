import { z } from "zod";

export const DIRECT_SALE_PAYMENT_METHODS =
  {
    CASH: "CASH",
    CLICK: "CLICK",
  } as const;

export const createDirectSaleSchema =
  z.object({
    paymentMethod:
      z.enum([
        DIRECT_SALE_PAYMENT_METHODS.CASH,
        DIRECT_SALE_PAYMENT_METHODS.CLICK,
      ]),

    items: z
      .array(
        z.object({
          productId: z
            .string()
            .trim()
            .min(1)
            .max(128),

          quantity: z
            .number()
            .int()
            .min(1)
            .max(99),
        }),
      )
      .min(
        1,
        "أضف منتجًا واحدًا على الأقل.",
      )
      .max(
        30,
        "عدد المنتجات في العملية كبير جدًا.",
      ),
  });