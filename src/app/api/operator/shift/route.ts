import { NextResponse } from "next/server";

import { resolveOperatorSession } from "@/lib/auth/operator-session";
import {
  getActiveShift,
  ShiftOwnedByAnotherEmployeeError,
  startShift,
} from "@/lib/shifts/shift-repository";
import { getStoreSecurityContext } from "@/lib/security/get-store-security-context";
import { hasValidOrigin } from "@/lib/security/has-valid-origin";
import { isSecurityError } from "@/lib/security/is-security-error";
import { toSecurityResponse } from "@/lib/security/to-security-response";

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
      return NextResponse.json({
        success: true,

        data: {
          stage:
            "NO_SHIFT",
        },
      });
    }

    /*
     * مهم:
     * الموظف الحالي لا يرث شفت موظف آخر.
     */
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
              `يوجد شفت مفتوح حاليًا باسم ${shift.openedByEmployeeName}. يجب إنهاء هذا الشفت قبل بدء شفت آخر.`,
          },
        },
        {
          status: 409,
        },
      );
    }

    return NextResponse.json({
      success: true,

      data: {
        stage:
          "OPEN_SHIFT",

        shift: {
          id:
            shift.id,

          openedAt:
            shift.openedAt.toISOString(),

          openedByEmployeeName:
            shift.openedByEmployeeName,
        },
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
      "Failed to load shift:",
      error,
    );

    return NextResponse.json(
      {
        success: false,

        error: {
          code:
            "INTERNAL_ERROR",

          message:
            "تعذر تحميل الشفت.",
        },
      },
      {
        status: 500,
      },
    );
  }
}

export async function POST(
  request: Request,
) {
  try {
    const storeContext =
      await getStoreSecurityContext();

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
      await startShift({
        storeAuthUid:
          storeContext.authUid,

        employeeId:
          operator.employeeId,

        employeeName:
          operator.employeeName,
      });

    return NextResponse.json({
      success: true,

      data: {
        shift: {
          id:
            shift.id,

          openedAt:
            shift.openedAt.toISOString(),

          openedByEmployeeName:
            shift.openedByEmployeeName,
        },
      },
    });
  } catch (error) {
    if (
      error instanceof
      ShiftOwnedByAnotherEmployeeError
    ) {
      return NextResponse.json(
        {
          success: false,

          error: {
            code:
              "SHIFT_OWNED_BY_ANOTHER_EMPLOYEE",

            message:
              error.message,
          },
        },
        {
          status: 409,
        },
      );
    }

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
      "Failed to start shift:",
      error,
    );

    return NextResponse.json(
      {
        success: false,

        error: {
          code:
            "INTERNAL_ERROR",

          message:
            "تعذر بدء الشفت.",
        },
      },
      {
        status: 500,
      },
    );
  }
}