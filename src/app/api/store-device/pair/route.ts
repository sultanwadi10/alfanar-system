import {
  NextResponse,
} from "next/server";
import { z } from "zod";

import {
  hasValidOrigin,
} from "@/lib/security/has-valid-origin";
import {
  STORE_DEVICE_CONFIG,
} from "@/lib/store/store-device-config";
import {
  buildPairingRequestFingerprint,
  pairStoreDevice,
  PairingRateLimitedError,
} from "@/lib/store/store-device-pairing-repository";
import {
  requireCurrentStoreStealthAccess,
} from "@/lib/store/store-stealth-access";
import {
  getStoreRuntimeState,
  STORE_RUNTIME_STATUSES,
} from "@/lib/store/store-runtime-repository";

const requestSchema =
  z.object({
    code:
      z.string()
        .min(8)
        .max(12),

    deviceName:
      z.string()
        .trim()
        .min(2)
        .max(40),
  });

function createHiddenResponse() {
  return NextResponse.json(
    {
      success: false,
      error: {
        code:
          "NOT_FOUND",
        message:
          "Not found.",
      },
    },
    {
      status: 404,
      headers: {
        "Cache-Control":
          "no-store, no-cache, must-revalidate",
      },
    },
  );
}

export async function POST(
  request: Request,
) {
  if (
    !hasValidOrigin(
      request,
    )
  ) {
    return createHiddenResponse();
  }

  try {
    const runtime =
      await getStoreRuntimeState();

    if (
      runtime.status ===
      STORE_RUNTIME_STATUSES.STOPPED
    ) {
      return createHiddenResponse();
    }

    await requireCurrentStoreStealthAccess(
      runtime,
    );

    const body =
      requestSchema.parse(
        await request.json(),
      );

    const result =
      await pairStoreDevice({
        code:
          body.code,

        deviceName:
          body.deviceName,

        fingerprint:
          buildPairingRequestFingerprint(
            request,
          ),
      });

    if (!result) {
      return NextResponse.json(
        {
          success: false,

          error: {
            code:
              "PAIRING_FAILED",

            message:
              "The access code is invalid or expired.",
          },
        },
        {
          status: 401,
        },
      );
    }

    const response =
      NextResponse.json({
        success: true,

        data: {
          paired: true,
        },
      });

    response.cookies.set(
      STORE_DEVICE_CONFIG
        .COOKIE_NAME,
      result.cookieValue,
      {
        httpOnly: true,

        secure:
          process.env.NODE_ENV ===
          "production",

        sameSite:
          "strict",

        path: "/",

        maxAge:
          STORE_DEVICE_CONFIG
            .MAX_AGE_SECONDS,
      },
    );

    response.headers.set(
      "Cache-Control",
      "no-store",
    );

    return response;
  } catch (error) {
    if (
      error instanceof
      PairingRateLimitedError
    ) {
      return NextResponse.json(
        {
          success: false,

          error: {
            code:
              "RATE_LIMITED",

            message:
              "Too many attempts. Try again later.",
          },
        },
        {
          status: 429,
        },
      );
    }

    return createHiddenResponse();
  }
}
