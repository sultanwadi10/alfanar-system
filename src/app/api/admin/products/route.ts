import { NextResponse } from "next/server";

import { createProductRecord } from "@/lib/products/product-repository";
import { getAdminSecurityContext } from "@/lib/security/get-admin-security-context";
import { isSecurityError } from "@/lib/security/is-security-error";
import { toSecurityResponse } from "@/lib/security/to-security-response";
import { productMutationSchema } from "@/lib/validation/product";

function hasValidOrigin(
  request: Request,
) {
  const origin =
    request.headers.get(
      "origin",
    );

  if (!origin) {
    return false;
  }

  return (
    origin ===
    new URL(
      request.url,
    ).origin
  );
}

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
              "بيانات الطلب غير صالحة.",
          },
        },
        {
          status: 400,
        },
      );
    }

    const parsed =
      productMutationSchema.safeParse(
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
              "تحقق من بيانات المنتج.",
          },
        },
        {
          status: 400,
        },
      );
    }

    const product =
      await createProductRecord(
        parsed.data,
        securityContext.authUid,
      );

    return NextResponse.json(
      {
        success: true,
        product,
      },
      {
        status: 201,
      },
    );
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
      "Failed to create product:",
      error,
    );

    return NextResponse.json(
      {
        success: false,

        error: {
          code:
            "INTERNAL_ERROR",

          message:
            "حدث خطأ أثناء إضافة المنتج.",
        },
      },
      {
        status: 500,
      },
    );
  }
}