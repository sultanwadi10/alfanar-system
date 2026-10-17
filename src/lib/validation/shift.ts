import { z } from "zod";

export const closeShiftSchema =
  z.object({
    actualCashFils: z
      .number()
      .int()
      .min(
        0,
        "قيمة الكاش الفعلي غير صالحة.",
      )
      .max(
        100_000_000,
        "قيمة الكاش الفعلي غير صالحة.",
      ),
  });