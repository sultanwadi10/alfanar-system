import { NextResponse } from "next/server";

import {
  getEmployeeAuthRecord,
} from "@/lib/employees/employee-repository";
import {
  saveEmployeeSchedule,
} from "@/lib/employees/employee-schedule-repository";
import { getAdminSecurityContext } from "@/lib/security/get-admin-security-context";
import { hasValidOrigin } from "@/lib/security/has-valid-origin";
import { isSecurityError } from "@/lib/security/is-security-error";
import { toSecurityResponse } from "@/lib/security/to-security-response";
import { employeeScheduleSchema } from "@/lib/validation/employee-schedule";

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
    const adminContext =
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
            code:
              "FORBIDDEN",

            message:
              "الطلب غير مسموح.",
          },
        },
        {
          status: 403,
        },
      );
    }

    const {
      employeeId,
    } =
      await context.params;

    const employee =
      await getEmployeeAuthRecord(
        employeeId,
      );

    if (!employee) {
      return NextResponse.json(
        {
          success: false,

          error: {
            code:
              "EMPLOYEE_NOT_FOUND",

            message:
              "الموظف غير موجود.",
          },
        },
        {
          status: 404,
        },
      );
    }

    let body: unknown;

    try {
      body =
        await request.json();
    } catch {
      return NextResponse.json(
        {
          success: false,

          error: {
            code:
              "INVALID_INPUT",

            message:
              "بيانات الجدول غير صالحة.",
          },
        },
        {
          status: 400,
        },
      );
    }

    const parsed =
      employeeScheduleSchema.safeParse(
        body,
      );

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,

          error: {
            code:
              "VALIDATION_ERROR",

            message:
              parsed.error.issues[0]
                ?.message ??
              "تحقق من جدول الموظف.",
          },
        },
        {
          status: 400,
        },
      );
    }

    await saveEmployeeSchedule(
      employeeId,
      parsed.data,
      adminContext.authUid,
    );

    return NextResponse.json({
      success: true,

      data: {
        employeeId,

        schedule:
          parsed.data,
      },
    });
  } catch (error) {
    if (
      isSecurityError(
        error,
      )
    ) {
      return toSecurityResponse(
        error,
      );
    }

    console.error(
      "Failed to save employee schedule:",
      error,
    );

    return NextResponse.json(
      {
        success: false,

        error: {
          code:
            "INTERNAL_ERROR",

          message:
            "تعذر حفظ جدول الموظف.",
        },
      },
      {
        status: 500,
      },
    );
  }
}
