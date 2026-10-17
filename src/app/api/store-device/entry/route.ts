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

export async function GET() {
  try {
    /*
     * Runtime is checked before device state.
     *
     * STOPPED means the public surface stays completely neutral:
     * no login, no pairing prompt, and no device-state disclosure.
     */
    const runtime =
      await getStoreRuntimeState();

    if (
      runtime.status ===
      STORE_RUNTIME_STATUSES.STOPPED
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

    return NextResponse.json(
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
  } catch {
    /*
     * Fail closed. Runtime/storage failures never reveal Store UI.
     */
    return createNeutralResponse();
  }
}
