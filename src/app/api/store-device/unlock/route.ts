import {
  NextResponse,
} from "next/server";
import { z } from "zod";

import {
  hasValidOrigin,
} from "@/lib/security/has-valid-origin";
import {
  buildStoreStealthRequestFingerprint,
  createStoreStealthAccessGrant,
  STORE_STEALTH_ACCESS_CONFIG,
  verifyStoreStealthUnlock,
} from "@/lib/store/store-stealth-access";
import {
  getStoreRuntimeState,
  STORE_RUNTIME_STATUSES,
} from "@/lib/store/store-runtime-repository";

export const dynamic =
  "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control":
    "no-store, no-cache, must-revalidate",
};

const requestSchema =
  z.object({
    code:
      z.string()
        .regex(/^\d{10}$/),
  });

function createNeutralResponse() {
  return new NextResponse(
    null,
    {
      status: 204,
      headers:
        NO_STORE_HEADERS,
    },
  );
}

export async function POST(
  request: Request,
) {
  try {
    if (
      !hasValidOrigin(
        request,
      )
    ) {
      return createNeutralResponse();
    }

    const runtime =
      await getStoreRuntimeState();

    if (
      runtime.status ===
      STORE_RUNTIME_STATUSES.STOPPED
    ) {
      return createNeutralResponse();
    }

    const parsed =
      requestSchema.safeParse(
        await request.json(),
      );

    if (!parsed.success) {
      return createNeutralResponse();
    }

    const allowed =
      await verifyStoreStealthUnlock({
        code:
          parsed.data.code,

        fingerprint:
          buildStoreStealthRequestFingerprint(
            request,
          ),
      });

    if (!allowed) {
      return createNeutralResponse();
    }

    const grant =
      await createStoreStealthAccessGrant();

    const response =
      NextResponse.json(
        {
          success: true,
        },
        {
          headers:
            NO_STORE_HEADERS,
        },
      );

    response.cookies.set(
      STORE_STEALTH_ACCESS_CONFIG
        .COOKIE_NAME,
      grant.cookieValue,
      {
        httpOnly: true,

        secure:
          process.env.NODE_ENV ===
          "production",

        sameSite: "strict",

        path: "/",

        maxAge:
          Math.floor(
            STORE_STEALTH_ACCESS_CONFIG
              .ACCESS_EXPIRES_IN_MS /
              1000,
          ),
      },
    );

    return response;
  } catch {
    return createNeutralResponse();
  }
}
