import { NextResponse } from "next/server";

import { archiveCustomerRecord } from "@/lib/customers/customer-repository";
import { getAdminSecurityContext } from "@/lib/security/get-admin-security-context";
import { isSecurityError } from "@/lib/security/is-security-error";
import { toSecurityResponse } from "@/lib/security/to-security-response";

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

    const archived =
      await archiveCustomerRecord(
        customerId,
        securityContext.authUid,
      );

    if (!archived) {
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
    });
  } catch (error) {
    if (isSecurityError(error)) {
      return toSecurityResponse(
        error,
      );
    }

    console.error(
      "Failed to archive customer:",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message:
            "حدث خطأ أثناء أرشفة العميل.",
        },
      },
      {
        status: 500,
      },
    );
  }
}