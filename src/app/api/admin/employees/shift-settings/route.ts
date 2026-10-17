import { NextResponse } from "next/server";

import { saveShiftTimeSettings } from "@/lib/employees/employee-schedule-repository";
import { getAdminSecurityContext } from "@/lib/security/get-admin-security-context";
import { hasValidOrigin } from "@/lib/security/has-valid-origin";
import { isSecurityError } from "@/lib/security/is-security-error";
import { toSecurityResponse } from "@/lib/security/to-security-response";
import { shiftTimeSettingsSchema } from "@/lib/validation/employee-schedule";


export async function PATCH(
  request: Request,
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
              "إعدادات الشفت غير صالحة.",
          },
        },
        {
          status: 400,
        },
      );
    }

    const parsed =
      shiftTimeSettingsSchema.safeParse(
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
              "تحقق من أوقات الشفتات.",
          },
        },
        {
          status: 400,
        },
      );
    }

    await saveShiftTimeSettings(
      parsed.data,
      adminContext.authUid,
    );

    return NextResponse.json({
      success: true,

      data:
        parsed.data,
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
      "Failed to save shift time settings:",
      error,
    );

    return NextResponse.json(
      {
        success: false,

        error: {
          code:
            "INTERNAL_ERROR",

          message:
            "تعذر حفظ أوقات الشفتات.",
        },
      },
      {
        status: 500,
      },
    );
  }
}
