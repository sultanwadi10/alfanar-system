import {
  NextResponse,
} from "next/server";

import {
  getVerifiedStoreSession,
} from "@/lib/auth/get-verified-store-session";
import {
  resolvePairedStoreDevice,
} from "@/lib/store/store-device-repository";
import {
  isStoreStealthAccessAllowed,
  resolveCurrentStoreStealthAccess,
  revokeCurrentStoreStealthAccess,
  STORE_STEALTH_ACCESS_CONFIG,
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

function clearStealthCookie(
  response: NextResponse,
) {
  response.cookies.set(
    STORE_STEALTH_ACCESS_CONFIG
      .COOKIE_NAME,
    "",
    {
      httpOnly: true,

      secure:
        process.env.NODE_ENV ===
        "production",

      sameSite: "strict",

      path: "/",

      maxAge: 0,
    },
  );
}

export async function GET() {
  try {
    const runtime =
      await getStoreRuntimeState();

    if (
      runtime.status ===
      STORE_RUNTIME_STATUSES.STOPPED
    ) {
      return createNeutralResponse();
    }

    const access =
      await resolveCurrentStoreStealthAccess();

    if (
      !access ||
      !isStoreStealthAccessAllowed(
        access,
        runtime,
      )
    ) {
      return createNeutralResponse();
    }

    const device =
      await resolvePairedStoreDevice();

    if (!device) {
      return NextResponse.json(
        {
          success: true,
          mode:
            "PAIR_REQUIRED",
        },
        {
          headers:
            NO_STORE_HEADERS,
        },
      );
    }

    let destination =
      "/login?target=store";

    try {
      await getVerifiedStoreSession();
      destination =
        "/employee";
    } catch {
      // A paired device without a valid Store session must sign in again.
    }

    const response =
      NextResponse.json(
        {
          success: true,
          mode: "ENTER",
          destination,
        },
        {
          headers:
            NO_STORE_HEADERS,
        },
      );

    if (
      destination ===
      "/employee"
    ) {
      await revokeCurrentStoreStealthAccess();
      clearStealthCookie(
        response,
      );
    }

    return response;
  } catch {
    return createNeutralResponse();
  }
}
