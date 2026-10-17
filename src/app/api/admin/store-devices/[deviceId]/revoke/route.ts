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
  revokeStoreDevice,
} from "@/lib/store/store-device-repository";

type RouteContext = {
  params: Promise<{
    deviceId: string;
  }>;
};

export async function POST(
  request: Request,
  context: RouteContext,
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

    const {
      deviceId,
    } =
      await context.params;

    if (!deviceId) {
      return NextResponse.json(
        {
          success: false,

          error: {
            code:
              "INVALID_DEVICE_ID",

            message:
              "معرف الجهاز غير صالح.",
          },
        },
        {
          status: 400,
        },
      );
    }

    const revoked =
      await revokeStoreDevice(
        deviceId,
        adminContext.authUid,
      );

    if (!revoked) {
      return NextResponse.json(
        {
          success: false,

          error: {
            code:
              "DEVICE_NOT_FOUND",

            message:
              "الجهاز غير موجود.",
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
      "Failed to revoke store device:",
      error,
    );

    return NextResponse.json(
      {
        success: false,

        error: {
          code:
            "INTERNAL_ERROR",

          message:
            "تعذر إلغاء صلاحية الجهاز.",
        },
      },
      {
        status: 500,
      },
    );
  }
}
