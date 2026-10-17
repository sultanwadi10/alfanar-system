import { NextResponse } from "next/server";

import { OPERATOR_SESSION_CONFIG } from "@/lib/auth/operator-session-config";
import { revokeCurrentOperatorSession } from "@/lib/auth/operator-session";
import { AUTH_SESSION_CONFIG } from "@/lib/auth/session-config";
import { hasValidOrigin } from "@/lib/security/has-valid-origin";

export async function POST(request: Request) {
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
            "INVALID_ORIGIN",

          message:
            "The request origin is not allowed.",
        },
      },
      {
        status: 403,
      },
    );
  }

  /*
   * Full Store Logout:
   *
   * 1. Revoke current employee/operator session.
   * 2. Clear Operator cookie.
   * 3. Clear Store cookie.
   *
   * This is different from "Switch Employee",
   * which clears only the Operator Session.
   */
  try {
    await revokeCurrentOperatorSession();
  } catch (error) {
    /*
     * حتى لو تعذر تحديث Firestore لسبب مؤقت،
     * لازم نمسح Cookies من المتصفح ونكمل الخروج.
     */
    console.error(
      "Failed to revoke operator session during store logout:",
      error,
    );
  }

  const response =
    NextResponse.json({
      success: true,

      data: {
        loggedOut: true,
      },
    });

  /*
   * Clear Operator Session cookie.
   */
  response.cookies.set(
    OPERATOR_SESSION_CONFIG.COOKIE_NAME,
    "",
    {
      httpOnly: true,

      secure:
        process.env.NODE_ENV ===
        "production",

      sameSite: "lax",

      path: "/",

      maxAge: 0,
    },
  );

  /*
   * Clear Store Session cookie.
   */
  response.cookies.set(
    AUTH_SESSION_CONFIG.COOKIE_NAMES.STORE,
    "",
    {
      httpOnly: true,

      secure:
        process.env.NODE_ENV ===
        "production",

      sameSite: "lax",

      path: "/",

      maxAge: 0,
    },
  );

  return response;
}