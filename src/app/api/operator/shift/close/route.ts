import { NextResponse } from "next/server";

import { resolveOperatorSession } from "@/lib/auth/operator-session";
import { getStoreSecurityContext } from "@/lib/security/get-store-security-context";
import { hasValidOrigin } from "@/lib/security/has-valid-origin";
import { isSecurityError } from "@/lib/security/is-security-error";
import { toSecurityResponse } from "@/lib/security/to-security-response";
import { closeShift } from "@/lib/shifts/shift-repository";
import { closeShiftSchema } from "@/lib/validation/shift";

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
              "البيانات غير صالحة.",
          },
        },
        {
          status: 400,
        },
      );
    }

    const parsed =
      closeShiftSchema.safeParse(
        body,
      );

    if (
      !parsed.success
    ) {
      return NextResponse.json(
        {
          success: false,

          error: {
            code:
              "VALIDATION_ERROR",

            message:
              parsed.error.issues[0]
                ?.message ??
              "تحقق من قيمة الكاش.",
          },
        },
        {
          status: 400,
        },
      );
    }

    /*
     * closeShift داخليًا:
     *
     * - يقرأ الكاش المتوقع
     * - يسجل actualCashFils
     * - يحسب differenceFils
     * - يغلق الشفت
     *
     * لكننا لا نعيد أيًا من هذه
     * الأرقام للموظف.
     */
    const result =
      await closeShift({
        storeAuthUid:
          storeContext.authUid,

        employeeId:
          operator.employeeId,

        employeeName:
          operator.employeeName,

        actualCashFils:
          parsed.data.actualCashFils,
      });

    if (!result) {
      return NextResponse.json(
        {
          success: false,

          error: {
            code:
              "SHIFT_NOT_AVAILABLE",

            message:
              "تعذر إنهاء الشفت الحالي.",
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
        closed:
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
      "Failed to close shift:",
      error,
    );

    return NextResponse.json(
      {
        success: false,

        error: {
          code:
            "INTERNAL_ERROR",

          message:
            "تعذر إنهاء الشفت.",
        },
      },
      {
        status: 500,
      },
    );
  }
}