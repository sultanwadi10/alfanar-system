import { NextResponse } from "next/server";
import { z } from "zod";

import { DeliveryOrderBusinessError } from "@/lib/orders/delivery-order-repository";
import { listAdminOrders } from "@/lib/orders/admin-delivery-orders";
import { getAdminSecurityContext } from "@/lib/security/get-admin-security-context";
import { isSecurityError } from "@/lib/security/is-security-error";
import { toSecurityResponse } from "@/lib/security/to-security-response";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  view: z.enum(["today", "date", "recent", "search"]).default("today"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  cursor: z.string().regex(/^\d{8}-\d{3,8}$/).optional(),
  q: z.string().trim().min(2).max(100).optional(),
});

function fail(message: string, code: string, status: number) {
  return NextResponse.json({ success: false, error: { message, code } }, {
    status, headers: { "Cache-Control": "private, no-store" },
  });
}

export async function GET(request: Request) {
  try {
    await getAdminSecurityContext();
    const params = new URL(request.url).searchParams;
    const parsed = querySchema.safeParse({
      view: params.get("view") ?? "today",
      date: params.get("date") ?? undefined,
      cursor: params.get("cursor") ?? undefined,
      q: params.get("q") ?? undefined,
    });
    if (!parsed.success) {
      return fail("خيارات البحث غير صالحة.", "INVALID_QUERY", 400);
    }
    const { view, date, cursor, q } = parsed.data;
    if (view === "date") {
      if (!date || !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) ||
          new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
        return fail("اختر تاريخًا صحيحًا.", "INVALID_DATE", 400);
      }
    }
    if (view === "search" && !q) {
      return fail("اكتب اسم عميل أو رقم هاتف كاملًا أو معرف طلب كاملًا.", "INVALID_QUERY", 400);
    }
    const data = await listAdminOrders({
      view,
      day: date?.replaceAll("-", ""),
      cursor,
      query: q,
    });
    return NextResponse.json({ success: true, data }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof DeliveryOrderBusinessError) {
      return fail(error.message, error.code, 409);
    }
    if (isSecurityError(error)) return toSecurityResponse(error);
    console.error("Admin delivery orders GET failed", error);
    return fail("تعذر تحميل طلبات التوصيل.", "INTERNAL_ERROR", 500);
  }
}
