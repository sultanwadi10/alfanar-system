import { NextResponse } from "next/server";
import { getAdminSecurityContext } from "@/lib/security/get-admin-security-context";
import { hasValidOrigin } from "@/lib/security/has-valid-origin";
import { isSecurityError } from "@/lib/security/is-security-error";
import { toSecurityResponse } from "@/lib/security/to-security-response";
async function useCatalog(request: Request) {
  try { await getAdminSecurityContext(); if (!hasValidOrigin(request)) return NextResponse.json({ success: false, error: { message: "الطلب غير مسموح." } }, { status: 403 }); return NextResponse.json({ success: false, error: { code: "USE_CATALOG", message: "إضافة المنتجات وتعديلها من صفحة الأصناف والأسعار." } }, { status: 409 }); }
  catch (error) { if (isSecurityError(error)) return toSecurityResponse(error); return NextResponse.json({ success: false }, { status: 500 }); }
}
export const POST = useCatalog;
