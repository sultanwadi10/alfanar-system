import {
  NextResponse,
} from "next/server";

import {
  getAdminSecurityContext,
} from "@/lib/security/get-admin-security-context";
import {
  hasValidOrigin,
} from "@/lib/security/has-valid-origin";
import {
  isSecurityError,
} from "@/lib/security/is-security-error";
import {
  toSecurityResponse,
} from "@/lib/security/to-security-response";
import {
  createStoreDevicePairingCode,
} from "@/lib/store/store-device-pairing-repository";

export async function POST(
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

    const challenge =
      await createStoreDevicePairingCode(
        adminContext.authUid,
      );

    return NextResponse.json({
      success: true,

      data: {
        code:
          challenge.code,

        expiresAt:
          challenge.expiresAt.toISOString(),
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
      "Failed to create store device pairing code:",
      error,
    );

    return NextResponse.json(
      {
        success: false,

        error: {
          code:
            "INTERNAL_ERROR",

          message:
            "تعذر إنشاء رمز ربط الجهاز.",
        },
      },
      {
        status: 500,
      },
    );
  }
}
