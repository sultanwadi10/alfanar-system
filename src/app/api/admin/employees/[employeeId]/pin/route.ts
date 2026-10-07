import { NextResponse } from "next/server";

import { updateEmployeePinHash } from "@/lib/employees/employee-repository";
import { getAdminSecurityContext } from "@/lib/security/get-admin-security-context";
import { hashEmployeePin } from "@/lib/security/employee-pin";
import { isSecurityError } from "@/lib/security/is-security-error";
import { toSecurityResponse } from "@/lib/security/to-security-response";
import { resetEmployeePinSchema } from "@/lib/validation/employee";

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
              "PIN must contain 4 to 6 digits.",
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
            "Employee PIN could not be updated.",
        },
      },
      {
        status: 500,
      },
    );
  }
}