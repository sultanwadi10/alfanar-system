import { NextResponse } from "next/server";

import { resolveOperatorSession } from "@/lib/auth/operator-session";
import { listProducts } from "@/lib/products/product-repository";
import { getStoreSecurityContext } from "@/lib/security/get-store-security-context";
import { isSecurityError } from "@/lib/security/is-security-error";
import { toSecurityResponse } from "@/lib/security/to-security-response";

export async function GET() {
  try {
    const storeContext =
      await getStoreSecurityContext();

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

    const products =
      await listProducts();

    const visibleProducts =
      products
        .filter(
          (product) =>
            product.isActive &&
            product.showForEmployee,
        )
        .map(
          (product) => ({
            id:
              product.id,

            name:
              product.name,

            category:
              product.category,

            storePriceFils:
              product.storePriceFils,

            imageUrl:
              product.imageUrl,
          }),
        );

    return NextResponse.json({
      success: true,

      data: {
        products:
          visibleProducts,
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
      "Failed to load operator products:",
      error,
    );

    return NextResponse.json(
      {
        success: false,

        error: {
          code:
            "INTERNAL_ERROR",

          message:
            "تعذر تحميل المنتجات.",
        },
      },
      {
        status: 500,
      },
    );
  }
}