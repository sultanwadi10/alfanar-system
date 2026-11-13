import { NextResponse } from "next/server";
import { getAdminSecurityContext } from "@/lib/security/get-admin-security-context";
import { isSecurityError } from "@/lib/security/is-security-error";
import { toSecurityResponse } from "@/lib/security/to-security-response";
import { readOperationChanges } from "@/lib/updates/operation-changes";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await getAdminSecurityContext();
    return NextResponse.json({ success: true, data: await readOperationChanges() }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (isSecurityError(error)) return toSecurityResponse(error);
    return NextResponse.json({ success: false }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
