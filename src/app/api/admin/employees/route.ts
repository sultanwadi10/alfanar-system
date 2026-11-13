import { withOperationChanges } from "@/lib/updates/operation-changes";
import { hasValidOrigin } from "@/lib/security/has-valid-origin";
import { NextResponse } from "next/server";

import { createEmployeeRecord } from "@/lib/employees/employee-repository";
import { getAdminSecurityContext } from "@/lib/security/get-admin-security-context";
import { hashEmployeePin } from "@/lib/security/employee-pin";
import { isSecurityError } from "@/lib/security/is-security-error";
import { toSecurityResponse } from "@/lib/security/to-security-response";
import { createEmployeeSchema } from "@/lib/validation/employee";

async function handlePOST(
  request: Request,
) {
  try {
    await getAdminSecurityContext();

    if (!hasValidOrigin(request)) return NextResponse.json({ success: false, error: { message: "الطلب غير مسموح." } }, { status: 403 });

    const body = await request.json();

    const parsed =
      createEmployeeSchema.safeParse(
        body,
      );

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code:
              "INVALID_EMPLOYEE_INPUT",
            message:
              "تحقق من اسم الموظف ورمز الدخول.",
          },
        },
        {
          status: 400,
        },
      );
    }

    const pinHash =
      await hashEmployeePin(
        parsed.data.pin,
      );

    const employee =
      await createEmployeeRecord({
        name: parsed.data.name,
        pinHash,
      });

    return NextResponse.json(
      {
        success: true,
        data: {
          employee,
        },
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    if (isSecurityError(error)) {
      return toSecurityResponse(
        error,
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: {
          code:
            "EMPLOYEE_CREATE_FAILED",
          message:
            "تعذّرت إضافة الموظف. حاول مجددًا.",
        },
      },
      {
        status: 500,
      },
    );
  }
}
export const POST = withOperationChanges(handlePOST, ["access","home"]);
