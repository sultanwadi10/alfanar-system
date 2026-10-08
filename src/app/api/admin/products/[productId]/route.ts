import { NextResponse } from "next/server";

import {
  deleteProductRecord,
  updateProductRecord,
} from "@/lib/products/product-repository";
import { getAdminSecurityContext } from "@/lib/security/get-admin-security-context";
import { isSecurityError } from "@/lib/security/is-security-error";
import { toSecurityResponse } from "@/lib/security/to-security-response";
import { productMutationSchema } from "@/lib/validation/product";

type RouteContext = {
  params: Promise<{
    productId: string;
  }>;
};

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

export async function PATCH(
  request: Request,
  context: RouteContext,
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

    const { productId } =
      await context.params;

    if (!productId) {
      return NextResponse.json(
        {
          success: false,

          error: {
            code:
              "INVALID_PRODUCT_ID",

            message:
              "معرف المنتج غير صالح.",
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
      await updateProductRecord(
        productId,
        parsed.data,
        securityContext.authUid,
      );

    if (!product) {
      return NextResponse.json(
        {
          success: false,

          error: {
            code:
              "PRODUCT_NOT_FOUND",

            message:
              "المنتج غير موجود.",
          },
        },
        {
          status: 404,
        },
      );
    }

    return NextResponse.json({
      success: true,
      product,
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
      "Failed to update product:",
      error,
    );

    return NextResponse.json(
      {
        success: false,

        error: {
          code:
            "INTERNAL_ERROR",

          message:
            "حدث خطأ أثناء تعديل المنتج.",
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
  context: RouteContext,
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

    const { productId } =
      await context.params;

    if (!productId) {
      return NextResponse.json(
        {
          success: false,

          error: {
            code:
              "INVALID_PRODUCT_ID",

            message:
              "معرف المنتج غير صالح.",
          },
        },
        {
          status: 400,
        },
      );
    }

    const deleted =
      await deleteProductRecord(
        productId,
        securityContext.authUid,
      );

    if (!deleted) {
      return NextResponse.json(
        {
          success: false,

          error: {
            code:
              "PRODUCT_NOT_FOUND",

            message:
              "المنتج غير موجود.",
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
      "Failed to delete product:",
      error,
    );

    return NextResponse.json(
      {
        success: false,

        error: {
          code:
            "INTERNAL_ERROR",

          message:
            "حدث خطأ أثناء حذف المنتج.",
        },
      },
      {
        status: 500,
      },
    );
  }
}