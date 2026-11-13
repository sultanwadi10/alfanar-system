import { z } from "zod";

export const createDeliveryOrderSchema = z.object({
  requestId: z.string().uuid(),
  expectedTotalFils: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
  customerId: z.string().trim().regex(/^[A-Za-z0-9_-]{1,128}$/, "معرّف غير صالح."),
  address: z.string().trim().min(5, "عنوان التوصيل غير مكتمل.").max(250),
  notes: z.string().trim().max(500),
  paymentMethod: z.enum(["CASH", "CLICK", "COUPON"]),
  newBookletRequested: z.boolean(),
  items: z.array(z.object({
    productId: z.string().trim().regex(/^[A-Za-z0-9_-]{1,128}$/, "معرّف غير صالح."),
    quantity: z.number().int().min(1).max(999),
    bottleOrigin: z.enum(["JORDANIAN", "SAUDI"]).nullable(),
  }).strict()).min(1, "أضف منتجًا واحدًا على الأقل.").max(30),
}).strict();

export type CreateDeliveryOrderInput = z.infer<typeof createDeliveryOrderSchema>;
