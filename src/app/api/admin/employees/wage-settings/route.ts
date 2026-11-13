import { NextResponse } from "next/server";
import { z } from "zod";
import { saveWageSettings } from "@/lib/employees/wage-settings";
import { getAdminSecurityContext } from "@/lib/security/get-admin-security-context";
import { hasValidOrigin } from "@/lib/security/has-valid-origin";
import { isSecurityError } from "@/lib/security/is-security-error";
import { toSecurityResponse } from "@/lib/security/to-security-response";
const headers = { "Cache-Control": "private, no-store" };
const schema = z.object({ dailyWageFils: z.number().int().min(0).max(100_000_000) }).strict();
export async function PATCH(request: Request) {
  try {
    const admin = await getAdminSecurityContext();
    if (!hasValidOrigin(request)) return NextResponse.json({ success: false, error: { message: "الطلب غير مسموح." } }, { status: 403, headers });
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ success: false, error: { message: "أدخل يومية صحيحة، بصفر أو أكثر وثلاث منازل عشرية كحد أقصى." } }, { status: 400, headers });
    await saveWageSettings(parsed.data.dailyWageFils, admin.authUid);
    return NextResponse.json({ success: true, data: parsed.data }, { headers });
  } catch (error) {
    if (isSecurityError(error)) return toSecurityResponse(error);
    console.error("Wage settings failed", error);
    return NextResponse.json({ success: false, error: { message: "تعذر حفظ اليومية. بياناتك ما زالت موجودة؛ أعد المحاولة." } }, { status: 500, headers });
  }
}
