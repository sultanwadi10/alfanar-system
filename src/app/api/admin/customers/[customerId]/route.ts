import { NextResponse } from "next/server";

import {
  CustomerLinkedPhoneChangeError,
  CustomerPhoneAlreadyExistsError,
  updateCustomerRecord,
} from "@/lib/customers/customer-repository";
import { getAdminSecurityContext } from "@/lib/security/get-admin-security-context";
import { isSecurityError } from "@/lib/security/is-security-error";
import { toSecurityResponse } from "@/lib/security/to-security-response";
import { updateCustomerSchema } from "@/lib/validation/customer";

type RouteContext = {
  params: Promise<{
    customerId: string;
  }>;
};

export async function PATCH(
  request: Request,
  context: RouteContext,
) {
  try {
    const securityContext =
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
            code: "INVALID_CUSTOMER_ID",
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
      updateCustomerSchema.safeParse(
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
      await updateCustomerRecord(
        customerId,
        {
          name:
            parsed.data.name,

          phoneNormalized:
            parsed.data.phone,

          primaryAddress:
            parsed.data.primaryAddress,

          adminNotes:
            parsed.data.adminNotes,

          adminAuthUid:
            securityContext.authUid,
        },
      );

    if (!customer) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "CUSTOMER_NOT_FOUND",
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

      customer: {
        id: customer.id,

        name: customer.name,

        phone: customer.phone,

        primaryAddress:
          customer.primaryAddress,

        adminNotes:
          customer.adminNotes,

        appLinked:
          customer.appLinked,
      },
    });
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

    if (
      error instanceof
      CustomerLinkedPhoneChangeError
    ) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code:
              "CUSTOMER_PHONE_LINKED",
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
      "Failed to update customer:",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message:
            "حدث خطأ أثناء تعديل العميل.",
        },
      },
      {
        status: 500,
      },
    );
  }
}