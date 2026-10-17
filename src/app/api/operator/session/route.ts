import { NextResponse } from "next/server";

import {
  createOperatorSession,
  resolveOperatorSession,
  revokeCurrentOperatorSession,
} from "@/lib/auth/operator-session";
import { OPERATOR_SESSION_CONFIG } from "@/lib/auth/operator-session-config";
import {
  getEmployeeAuthRecord,
  listActiveEmployees,
} from "@/lib/employees/employee-repository";
import { getEmployeeCurrentScheduleAccess } from "@/lib/employees/employee-schedule-repository";
import {
  clearFailedPinAttempts,
  getPinLockState,
  registerFailedPinAttempt,
} from "@/lib/security/employee-pin-attempts";
import { verifyEmployeePin } from "@/lib/security/employee-pin";
import { getStoreSecurityContext } from "@/lib/security/get-store-security-context";
import { hasValidOrigin } from "@/lib/security/has-valid-origin";
import { isSecurityError } from "@/lib/security/is-security-error";
import { toSecurityResponse } from "@/lib/security/to-security-response";
import { operatorLoginSchema } from "@/lib/validation/operator-login";

export async function GET() {
  try {
    const storeContext =
      await getStoreSecurityContext();

    const operator =
      await resolveOperatorSession(
        storeContext.authUid,
      );

    if (operator) {
      return NextResponse.json({
        success: true,

        data: {
          stage:
            "OPERATOR",

          operator: {
            employeeId:
              operator.employeeId,

            employeeName:
              operator.employeeName,
          },
        },
      });
    }

    /*
     * نعرض جميع الموظفين الفعّالين.
     *
     * لا نفلتر حسب جدول الدوام هنا.
     * التحقق الحقيقي من وقت الدوام
     * يتم Server-side داخل POST
     * بعد اختيار الموظف.
     */
    const employees =
      await listActiveEmployees();

    return NextResponse.json({
      success: true,

      data: {
        stage:
          "SELECT_EMPLOYEE",

        employees:
          employees.map(
            (employee) => ({
              id:
                employee.id,

              name:
                employee.name,
            }),
          ),
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
      "Failed to load operator session:",
      error,
    );

    return NextResponse.json(
      {
        success: false,

        error: {
          code:
            "INTERNAL_ERROR",

          message:
            "تعذر تحميل جلسة الموظف.",
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
              "بيانات الدخول غير صالحة.",
          },
        },
        {
          status: 400,
        },
      );
    }

    const parsed =
      operatorLoginSchema.safeParse(
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
              "تحقق من بيانات الدخول.",
          },
        },
        {
          status: 400,
        },
      );
    }

    const {
      employeeId,
      pin,
    } =
      parsed.data;

    const employee =
      await getEmployeeAuthRecord(
        employeeId,
      );

    if (
      !employee ||
      !employee.isActive
    ) {
      return NextResponse.json(
        {
          success: false,

          error: {
            code:
              "INVALID_EMPLOYEE",

            message:
              "تعذر تسجيل الدخول.",
          },
        },
        {
          status: 401,
        },
      );
    }

    /*
     * نتحقق أولًا أن الموظف
     * داخل وقت الدوام المسموح.
     */
    const initialScheduleAccess =
      await getEmployeeCurrentScheduleAccess(
        employee.id,
      );

    if (
      !initialScheduleAccess.allowed
    ) {
      return NextResponse.json(
        {
          success: false,

          error: {
            code:
              "OUTSIDE_SCHEDULE",

            message:
              "غير مسموح لك بالدخول الآن. لا يوجد دوام مجدول لك في هذا الوقت.",
          },
        },
        {
          status: 403,
        },
      );
    }

    const lockState =
      await getPinLockState(
        storeContext.authUid,
        employee.id,
      );

    if (
      lockState.locked
    ) {
      return NextResponse.json(
        {
          success: false,

          error: {
            code:
              "PIN_LOCKED",

            message:
              "تم إيقاف محاولات PIN مؤقتًا. حاول بعد عدة دقائق.",
          },
        },
        {
          status: 429,
        },
      );
    }

    const pinValid =
      await verifyEmployeePin(
        pin,
        employee.pinHash,
      );

    if (!pinValid) {
      const failure =
        await registerFailedPinAttempt(
          storeContext.authUid,
          employee.id,
        );

      return NextResponse.json(
        {
          success: false,

          error: {
            code:
              failure.locked
                ? "PIN_LOCKED"
                : "INVALID_PIN",

            message:
              failure.locked
                ? "تم إيقاف محاولات PIN مؤقتًا بسبب تكرار المحاولات الخاطئة."
                : "رمز PIN غير صحيح.",
          },
        },
        {
          status:
            failure.locked
              ? 429
              : 401,
        },
      );
    }

    /*
     * نفحص الجدول مرة ثانية
     * بعد التحقق من PIN.
     *
     * هذا يمنع إنشاء جلسة لو انتهى
     * وقت الدوام أثناء عملية التحقق.
     */
    const finalScheduleAccess =
      await getEmployeeCurrentScheduleAccess(
        employee.id,
      );

    if (
      !finalScheduleAccess.allowed
    ) {
      return NextResponse.json(
        {
          success: false,

          error: {
            code:
              "OUTSIDE_SCHEDULE",

            message:
              "انتهى وقت الدوام المسموح لهذا الموظف.",
          },
        },
        {
          status: 403,
        },
      );
    }

    await clearFailedPinAttempts(
      storeContext.authUid,
      employee.id,
    );

    /*
     * نلغي أي Operator Session سابقة
     * قبل إنشاء جلسة الموظف الجديدة.
     */
    await revokeCurrentOperatorSession();

    const operatorSession =
      await createOperatorSession(
        storeContext.authUid,
        employee,
      );

    const response =
      NextResponse.json({
        success: true,

        data: {
          employee: {
            id:
              employee.id,

            name:
              employee.name,
          },
        },
      });

    response.cookies.set(
      OPERATOR_SESSION_CONFIG.COOKIE_NAME,
      operatorSession.token,
      {
        httpOnly: true,

        secure:
          process.env.NODE_ENV ===
          "production",

        sameSite: "lax",

        path: "/",

        maxAge:
          Math.floor(
            OPERATOR_SESSION_CONFIG.EXPIRES_IN_MS /
              1000,
          ),
      },
    );

    return response;
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
      "Failed to create operator session:",
      error,
    );

    return NextResponse.json(
      {
        success: false,

        error: {
          code:
            "INTERNAL_ERROR",

          message:
            "تعذر تسجيل دخول الموظف.",
        },
      },
      {
        status: 500,
      },
    );
  }
}

export async function DELETE(
  request: Request,
) {
  try {
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

    await revokeCurrentOperatorSession();

    const response =
      NextResponse.json({
        success: true,
      });

    response.cookies.set(
      OPERATOR_SESSION_CONFIG.COOKIE_NAME,
      "",
      {
        httpOnly: true,

        secure:
          process.env.NODE_ENV ===
          "production",

        sameSite: "lax",

        path: "/",

        maxAge: 0,
      },
    );

    return response;
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
      "Failed to clear operator session:",
      error,
    );

    return NextResponse.json(
      {
        success: false,

        error: {
          code:
            "INTERNAL_ERROR",

          message:
            "تعذر تبديل الموظف.",
        },
      },
      {
        status: 500,
      },
    );
  }
}