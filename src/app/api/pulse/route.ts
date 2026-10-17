import {
  NextResponse,
} from "next/server";

import {
  getStoreSecurityContext,
} from "@/lib/security/get-store-security-context";
import {
  isSecurityError,
} from "@/lib/security/is-security-error";

export const dynamic =
  "force-dynamic";

export async function GET() {
  try {
    await getStoreSecurityContext();

    return NextResponse.json(
      {
        ok: true,
      },
      {
        headers: {
          "Cache-Control":
            "no-store, no-cache, must-revalidate",
        },
      },
    );
  } catch (error) {
    if (
      isSecurityError(
        error,
      )
    ) {
      /*
       * intentionally generic.
       *
       * لا نكشف هل السبب:
       * - session expired
       * - session revoked
       * - runtime stopped
       */
      return NextResponse.json(
        {
          ok: false,
        },
        {
          status: 401,

          headers: {
            "Cache-Control":
              "no-store, no-cache, must-revalidate",
          },
        },
      );
    }

    console.error(
      "Pulse check failed:",
      error,
    );

    return NextResponse.json(
      {
        ok: false,
      },
      {
        status: 503,

        headers: {
          "Cache-Control":
            "no-store, no-cache, must-revalidate",
        },
      },
    );
  }
}