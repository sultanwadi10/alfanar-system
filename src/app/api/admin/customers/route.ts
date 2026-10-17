import { NextResponse } from "next/server";

import {
  createCustomerRecord,
  CustomerPhoneAlreadyExistsError,
} from "@/lib/customers/customer-repository";
import { getAdminSecurityContext } from "@/lib/security/get-admin-security-context";
import { hasValidOrigin } from "@/lib/security/has-valid-origin";
import { isSecurityError } from "@/lib/security/is-security-error";
import { toSecurityResponse } from "@/lib/security/to-security-response";
import { createCustomerSchema } from "@/lib/validation/customer";

export async function POST(
  request: Request,
) {
  try {
    const securityContext =
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

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_INPUT",
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
      createCustomerSchema.safeParse(
        body,
      );

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message:
              parsed.error.issues[0]
                ?.message ??
              "تحقق من بيانات العميل.",
          },
        },
        {
          status: 400,
        },
      );
    }

   const customer =
  await createCustomerRecord({
    name: parsed.data.name,

    phoneNormalized:
      parsed.data.phone,

    primaryAddress:
      parsed.data.primaryAddress,

    adminNotes:
      parsed.data.adminNotes,

    creator: {
      source: "ADMIN",

      authUid:
        securityContext.authUid,
    },
  });
    return NextResponse.json(
      {
        success: true,

        customer: {
          id: customer.id,

          name: customer.name,

          phone: customer.phone,

          couponBalance:
            customer.couponBalance,

          appLinked:
            customer.appLinked,

          createdAt:
            customer.createdAt.toISOString(),
        },
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    if (
      error instanceof
      CustomerPhoneAlreadyExistsError
    ) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code:
              "CUSTOMER_PHONE_EXISTS",
            message:
              "يوجد عميل مسجل بهذا الرقم مسبقًا.",
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
      "Failed to create customer:",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message:
            "حدث خطأ أثناء إنشاء العميل.",
        },
      },
      {
        status: 500,
      },
    );
  }
}
