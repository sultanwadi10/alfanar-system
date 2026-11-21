import { readPulseState } from "@/lib/updates/pulse-state";
import { cookies } from "next/headers";
import { OPERATOR_SESSION_CONFIG } from "@/lib/auth/operator-session-config";
import {
  NextResponse,
} from "next/server";

import {
  isSecurityError,
} from "@/lib/security/is-security-error";

export const dynamic =
  "force-dynamic";

export async function GET() {
  try {
    const state = await readPulseState();

    const response=NextResponse.json(
      state,
      {
        headers: {
          "Cache-Control":
            "no-store, no-cache, must-revalidate",
        },
      },
    );
    // Keep the existing cookie until its fixed nine-hour deadline, never sliding it.
    if(state.operatorEmployeeId&&state.operatorExpiresAt){const token=(await cookies()).get(OPERATOR_SESSION_CONFIG.COOKIE_NAME)?.value;if(token)response.cookies.set(OPERATOR_SESSION_CONFIG.COOKIE_NAME,token,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",expires:new Date(state.operatorExpiresAt)});}
    return response;
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
