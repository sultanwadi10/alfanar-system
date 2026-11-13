import { withOperationChanges } from "@/lib/updates/operation-changes";
import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { getFirebaseAdminFirestore } from "@/lib/firebase/admin";
import { employeeNameSchema } from "@/lib/validation/employee";
import { getAdminSecurityContext } from "@/lib/security/get-admin-security-context";
import { hasValidOrigin } from "@/lib/security/has-valid-origin";
import { isSecurityError } from "@/lib/security/is-security-error";
import { toSecurityResponse } from "@/lib/security/to-security-response";
const headers = { "Cache-Control": "private, no-store" };
async function handlePATCH(request: Request, context: { params: Promise<{ employeeId: string }> }) {
  try {
    await getAdminSecurityContext();
    if (!hasValidOrigin(request)) return NextResponse.json({ success: false, error: { message: "الطلب غير مسموح." } }, { status: 403, headers });
    const { employeeId } = await context.params;
    const parsed = z.object({ name: employeeNameSchema }).strict().safeParse(await request.json().catch(() => null));
    if (!/^[A-Za-z0-9_-]{1,150}$/.test(employeeId) || !parsed.success) return NextResponse.json({ success: false, error: { message: "تحقق من اسم الموظف." } }, { status: 400, headers });
    const ref = getFirebaseAdminFirestore().collection("employees").doc(employeeId);
    const updated = await getFirebaseAdminFirestore().runTransaction(async tx => {
      if (!(await tx.get(ref)).exists) return false;
      tx.update(ref, { name: parsed.data.name, updatedAt: Timestamp.now() }); return true;
    });
    if (!updated) return NextResponse.json({ success: false, error: { message: "الموظف غير موجود." } }, { status: 404, headers });
    return NextResponse.json({ success: true }, { headers });
  } catch (error) {
    if (isSecurityError(error)) return toSecurityResponse(error);
    return NextResponse.json({ success: false, error: { message: "تعذر تعديل الموظف." } }, { status: 500, headers });
  }
}

export const PATCH = withOperationChanges(handlePATCH, ["access","home"]);
