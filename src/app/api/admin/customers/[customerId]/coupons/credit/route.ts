import { NextResponse } from "next/server";

import {
  ArchivedCustomerOperationError,
  creditCustomerCoupons,
  CustomerCouponLimitError,
} from "@/lib/customers/customer-repository";
import { getAdminSecurityContext } from "@/lib/security/get-admin-security-context";
import { isSecurityError } from "@/lib/security/is-security-error";
import { toSecurityResponse } from "@/lib/security/to-security-response";
import { creditCustomerCouponsSchema } from "@/lib/validation/customer";

type RouteContext = {
  params: Promise<{
    customerId: string;
  }>;
};

export async function POST(
  request: Request,
  context: RouteContext,
) {
  try {
    const securityContext =
      await getAdminSecurityContext();

    const origin =
      request.headers.get(
        "origin",
      );

    const requestOrigin =
      new URL(
        request.url,
      ).origin;

    if (
      !origin ||
      origin !== requestOrigin
    ) {
      return NextResponse.json(
        {
          success: false,

          error: {
            code: "FORBIDDEN",

            message:
              "الطلب غير مسموح.",
          },
        },
        {
          status: 403,
        },
      );
    }

    const { customerId } =
      await context.params;

    if (!customerId) {
      return NextResponse.json(
        {
          success: false,

          error: {
            code:
              "INVALID_CUSTOMER_ID",

            message:
              "معرف العميل غير صالح.",
          },
        },
        {
          status: 400,
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
              "بيانات الطلب غير صالحة.",
          },
        },
        {
          status: 400,
        },
      );
    }

    const parsed =
      creditCustomerCouponsSchema.safeParse(
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
              "تحقق من بيانات العملية.",
          },
        },
        {
          status: 400,
        },
      );
    }

    const couponTransaction =
      await creditCustomerCoupons(
        customerId,
        {
          amount:
            parsed.data.amount,

          reason:
            parsed.data.reason,

          adminAuthUid:
            securityContext.authUid,
        },
      );

    if (!couponTransaction) {
      return NextResponse.json(
        {
          success: false,

          error: {
            code:
              "CUSTOMER_NOT_FOUND",

            message:
              "العميل غير موجود.",
          },
        },
        {
          status: 404,
        },
      );
    }

    return NextResponse.json({
      success: true,

      transaction: {
        id:
          couponTransaction.id,

        amount:
          couponTransaction.amount,

        balanceBefore:
          couponTransaction.balanceBefore,

        balanceAfter:
          couponTransaction.balanceAfter,

        createdAt:
          couponTransaction.createdAt.toISOString(),
      },
    });
  } catch (error) {
    if (
      error instanceof
      CustomerCouponLimitError
    ) {
      return NextResponse.json(
        {
          success: false,

          error: {
            code:
              "COUPON_LIMIT_EXCEEDED",

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
      ArchivedCustomerOperationError
    ) {
      return NextResponse.json(
        {
          success: false,

          error: {
            code:
              "CUSTOMER_ARCHIVED",

            message:
              error.message,
          },
        },
        {
          status: 409,
        },
      );
    }

    if (isSecurityError(error)) {
      return toSecurityResponse(
        error,
      );
    }

    console.error(
      "Failed to credit customer coupons:",
      error,
    );

    return NextResponse.json(
      {
        success: false,

        error: {
          code:
            "INTERNAL_ERROR",

          message:
            "حدث خطأ أثناء إضافة الكوبونات.",
        },
      },
      {
        status: 500,
      },
    );
  }
}