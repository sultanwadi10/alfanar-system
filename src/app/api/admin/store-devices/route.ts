import {
  NextResponse,
} from "next/server";

import {
  getAdminSecurityContext,
} from "@/lib/security/get-admin-security-context";
import {
  isSecurityError,
} from "@/lib/security/is-security-error";
import {
  toSecurityResponse,
} from "@/lib/security/to-security-response";
import {
  listStoreDevices,
} from "@/lib/store/store-device-repository";

export const dynamic =
  "force-dynamic";

export async function GET() {
  try {
    await getAdminSecurityContext();

    const devices =
      await listStoreDevices();

    return NextResponse.json({
      success: true,

      data: {
        devices:
          devices.map(
            (device) => ({
              id:
                device.id,

              name:
                device.name,

              createdAt:
                device.createdAt.toISOString(),

              lastSeenAt:
                device.lastSeenAt.toISOString(),

              revokedAt:
                device.revokedAt
                  ?.toISOString() ??
                null,
            }),
          ),
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
      "Failed to list store devices:",
      error,
    );

    return NextResponse.json(
      {
        success: false,

        error: {
          code:
            "INTERNAL_ERROR",

          message:
            "تعذر تحميل أجهزة المحل.",
        },
      },
      {
        status: 500,
      },
    );
  }
}
