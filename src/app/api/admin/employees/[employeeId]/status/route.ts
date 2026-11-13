import { withOperationChanges } from "@/lib/updates/operation-changes";
import { NextResponse } from "next/server";

import { updateEmployeeActiveStatus } from "@/lib/employees/employee-repository";
import { getAdminSecurityContext } from "@/lib/security/get-admin-security-context";
import { hasValidOrigin } from "@/lib/security/has-valid-origin";
import { isSecurityError } from "@/lib/security/is-security-error";
import { toSecurityResponse } from "@/lib/security/to-security-response";
import { updateEmployeeStatusSchema } from "@/lib/validation/employee";

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
      updateEmployeeStatusSchema.safeParse(
        body,
      );

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code:
              "INVALID_EMPLOYEE_STATUS",
            message:
              "حالة الموظف غير صالحة.",
          },
        },
        {
          status: 400,
        },
      );
    }

    const updated =
      await updateEmployeeActiveStatus(
        employeeId,
        parsed.data.isActive,
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
        isActive:
          parsed.data.isActive,
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
            "EMPLOYEE_STATUS_UPDATE_FAILED",
          message:
            "تعذّر تحديث حالة الموظف.",
        },
      },
      {
        status: 500,
      },
    );
  }
}

export const PATCH = withOperationChanges(handlePATCH, ["access","home"]);
