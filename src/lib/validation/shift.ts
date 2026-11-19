import { z } from "zod";
import { cashCount } from "@/lib/shifts/cash-count";

export const closeShiftSchema =
  z.object({
    shiftId: z.string().regex(/^[A-Za-z0-9_-]{1,150}$/),
    banknotesFils: z.number().int().min(0).max(100_000_000).optional(),
    coinsFils: z.number().int().min(0).max(100_000_000).optional(),
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
  }).strict().refine(value => { try { cashCount(value); return true; } catch { return false; } }, { message: "مجموع الورقي والمعدني لا يطابق الكاش الفعلي." });
