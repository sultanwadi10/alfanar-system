import { NextResponse } from "next/server";

import { updateEmployeeActiveStatus } from "@/lib/employees/employee-repository";
import { getAdminSecurityContext } from "@/lib/security/get-admin-security-context";
import { isSecurityError } from "@/lib/security/is-security-error";
import { toSecurityResponse } from "@/lib/security/to-security-response";
import { updateEmployeeStatusSchema } from "@/lib/validation/employee";

type RouteContext = {
  params: Promise<{
    employeeId: string;
  }>;
};

export async function PATCH(
  request: Request,
  context: RouteContext,
) {
  try {
    await getAdminSecurityContext();

    const origin =
      request.headers.get("origin");

    const requestOrigin =
      new URL(request.url).origin;

    if (
      !origin ||
      origin !== requestOrigin
    ) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_ORIGIN",
            message:
              "The request origin is not allowed.",
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
              "Employee status is invalid.",
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
              "Employee was not found.",
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
            "Employee status could not be updated.",
        },
      },
      {
        status: 500,
      },
    );
  }
}