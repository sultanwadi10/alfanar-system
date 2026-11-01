import { NextResponse } from "next/server";
import { z } from "zod";
import {
  BookletError, getAdminCouponDashboard, registerPhysicalBooklet, updateBookletPrice,
} from "@/lib/coupons/booklet-service";
import { getAdminSecurityContext } from "@/lib/security/get-admin-security-context";
import { hasValidOrigin } from "@/lib/security/has-valid-origin";
import { isSecurityError } from "@/lib/security/is-security-error";
import { toSecurityResponse } from "@/lib/security/to-security-response";

export const dynamic = "force-dynamic";
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("ADD"), serial: z.string().trim().min(4).max(40) }).strict(),
  z.object({ action: z.literal("PRICE"), priceFils: z.number().int().min(1).max(1_000_000) }).strict(),
]);
function fail(message: string, code: string, status: number) {
  return NextResponse.json({ success: false, error: { code, message } },
    { status, headers: { "Cache-Control": "private, no-store" } });
}
export async function GET(request: Request) {
  try {
    await getAdminSecurityContext();
    const cursor = new URL(request.url).searchParams.get("cursor") ?? undefined;
    if (cursor && !/^[a-f0-9]{64}$/.test(cursor)) return fail("مؤشر صفحة غير صالح.", "INVALID_CURSOR", 400);
    const data = await getAdminCouponDashboard(cursor);
    return NextResponse.json({ success: true, data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof BookletError) return fail(error.message, error.code, 409);
    if (isSecurityError(error)) return toSecurityResponse(error);
    console.error("Coupon dashboard read failed", error);
    return fail("تعذر تحميل لوحة الدفاتر.", "INTERNAL_ERROR", 500);
  }
}
export async function POST(request: Request) {
  try {
    const admin = await getAdminSecurityContext();
    if (!hasValidOrigin(request)) return fail("الطلب غير مسموح.", "FORBIDDEN", 403);
    let body: unknown;
    try { body = await request.json(); } catch { return fail("البيانات غير صالحة.", "INVALID_INPUT", 400); }
    const parsed = schema.safeParse(body);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "البيانات غير صالحة.", "INVALID_INPUT", 400);
    if (parsed.data.action === "ADD") {
      const id = await registerPhysicalBooklet(parsed.data.serial, admin.authUid);
      return NextResponse.json({ success: true, data: { id } }, { status: 201 });
    }
    await updateBookletPrice(parsed.data.priceFils, admin.authUid);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof BookletError) return fail(error.message, error.code, 409);
    if (isSecurityError(error)) return toSecurityResponse(error);
    console.error("Coupon dashboard write failed", error);
    return fail("تعذر تنفيذ العملية.", "INTERNAL_ERROR", 500);
  }
}
