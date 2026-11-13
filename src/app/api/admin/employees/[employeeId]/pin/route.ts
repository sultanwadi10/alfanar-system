import { withOperationChanges } from "@/lib/updates/operation-changes";
import { NextResponse } from "next/server";

import { updateEmployeePinHash } from "@/lib/employees/employee-repository";
import { getAdminSecurityContext } from "@/lib/security/get-admin-security-context";
import { hasValidOrigin } from "@/lib/security/has-valid-origin";
import { hashEmployeePin } from "@/lib/security/employee-pin";
import { isSecurityError } from "@/lib/security/is-security-error";
import { toSecurityResponse } from "@/lib/security/to-security-response";
import { resetEmployeePinSchema } from "@/lib/validation/employee";

type RouteContext = {
  params: Promise<{
    employeeId: string;
  }>;
};

async function handlePATCH(
  request: Request,
  context: RouteContext,
) {
  try {
    await getAdminSecurityContext();

    if (
      !hasValidOrigin(
        request,
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_ORIGIN",
            message:
              "الطلب غير مسموح.",
          },
        },
        {
          status: 403,
        },
      );
    }

    const { employeeId } =
      await context.params;

    const body = await request.json();

    const parsed =
      resetEmployeePinSchema.safeParse(
        body,
      );

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_EMPLOYEE_PIN",
            message:
              "رمز الدخول يجب أن يتكون من 4 إلى 6 أرقام.",
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

    const updated =
      await updateEmployeePinHash(
        employeeId,
        pinHash,
      );

    if (!updated) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "EMPLOYEE_NOT_FOUND",
            message:
              "الموظف غير موجود.",
          },
        },
        {
          status: 404,
        },
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        employeeId,
        pinReset: true,
      },
    });
  } catch (error) {
    if (isSecurityError(error)) {
      return toSecurityResponse(error);
    }

    return NextResponse.json(
      {
        success: false,
        error: {
          code:
            "EMPLOYEE_PIN_RESET_FAILED",
          message:
            "تعذّر تحديث رمز دخول الموظف.",
        },
      },
      {
        status: 500,
      },
    );
  }
}

export const PATCH = withOperationChanges(handlePATCH, ["access","home"]);
