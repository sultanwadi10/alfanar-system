import { z } from "zod";

export const closeShiftSchema =
  z.object({
    shiftId: z.string().regex(/^[A-Za-z0-9_-]{1,150}$/),
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