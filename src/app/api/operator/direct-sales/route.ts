import { NextResponse } from "next/server";

import { resolveOperatorSession } from "@/lib/auth/operator-session";
import {
  createDirectSale,
  NoActiveShiftError,
  ProductUnavailableError,
} from "@/lib/sales/direct-sale-repository";
import { getStoreSecurityContext } from "@/lib/security/get-store-security-context";
import { hasValidOrigin } from "@/lib/security/has-valid-origin";
import { isSecurityError } from "@/lib/security/is-security-error";
import { toSecurityResponse } from "@/lib/security/to-security-response";
import { createDirectSaleSchema } from "@/lib/validation/direct-sale";

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
              "بيانات عملية البيع غير صالحة.",
          },
        },
        {
          status: 400,
        },
      );
    }

    const parsed =
      createDirectSaleSchema.safeParse(
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
              "تحقق من بيانات البيع.",
          },
        },
        {
          status: 400,
        },
      );
    }

    const result =
      await createDirectSale({
        storeAuthUid:
          storeContext.authUid,

        employeeId:
          operator.employeeId,

        employeeName:
          operator.employeeName,

        paymentMethod:
          parsed.data.paymentMethod,

        items:
          parsed.data.items,
      });

    return NextResponse.json(
      {
        success: true,

        data: {
          saleId:
            result.saleId,

          totalFils:
            result.totalFils,

          paymentMethod:
            result.paymentMethod,

          createdAt:
            result.createdAt.toISOString(),
        },
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    if (
      error instanceof
      NoActiveShiftError
    ) {
      return NextResponse.json(
        {
          success: false,

          error: {
            code:
              "NO_ACTIVE_SHIFT",

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
      error instanceof
      ProductUnavailableError
    ) {
      return NextResponse.json(
        {
          success: false,

          error: {
            code:
              "PRODUCT_UNAVAILABLE",

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
      "Failed to create direct sale:",
      error,
    );

    return NextResponse.json(
      {
        success: false,

        error: {
          code:
            "INTERNAL_ERROR",

          message:
            "تعذر تسجيل عملية البيع.",
        },
      },
      {
        status: 500,
      },
    );
  }
}