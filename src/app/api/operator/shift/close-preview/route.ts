import { NextResponse } from "next/server";

import { resolveOperatorSession } from "@/lib/auth/operator-session";
import { getStoreSecurityContext } from "@/lib/security/get-store-security-context";
import { isSecurityError } from "@/lib/security/is-security-error";
import { toSecurityResponse } from "@/lib/security/to-security-response";
import { getActiveShift } from "@/lib/shifts/shift-repository";

export async function GET() {
  try {
    const storeContext =
      await getStoreSecurityContext();

    const operator =
      await resolveOperatorSession(
        storeContext.authUid,
      );

    if (!operator) {
      return NextResponse.json(
        {
          success: false,

          error: {
            code:
              "OPERATOR_REQUIRED",

            message:
              "يجب تسجيل دخول الموظف.",
          },
        },
        {
          status: 401,
        },
      );
    }

    const shift =
      await getActiveShift(
        storeContext.authUid,
      );

    if (!shift) {
      return NextResponse.json(
        {
          success: false,

          error: {
            code:
              "NO_ACTIVE_SHIFT",

            message:
              "لا يوجد شفت مفتوح.",
          },
        },
        {
          status: 409,
        },
      );
    }

    if (
      shift.openedByEmployeeId !==
      operator.employeeId
    ) {
      return NextResponse.json(
        {
          success: false,

          error: {
            code:
              "SHIFT_OWNED_BY_ANOTHER_EMPLOYEE",

            message:
              `الشفت الحالي مفتوح باسم ${shift.openedByEmployeeName}.`,
          },
        },
        {
          status: 409,
        },
      );
    }

    /*
     * ممنوع إعادة أي أرقام مالية
     * للموظف من هذا endpoint.
     */
    return NextResponse.json({
      success: true,

      data: {
        canClose:
          true,
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
      "Failed to prepare shift close:",
      error,
    );

    return NextResponse.json(
      {
        success: false,

        error: {
          code:
            "INTERNAL_ERROR",

          message:
            "تعذر تجهيز إنهاء الشفت.",
        },
      },
      {
        status: 500,
      },
    );
  }
}