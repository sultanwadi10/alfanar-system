
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  ADMIN_STEALTH_ACCESS_CONFIG,
  consumeCurrentAdminStealthAccess,
  hasCurrentAdminStealthAccess,
} from "@/lib/admin/admin-stealth-access";

import {
  createFirebaseSessionCookie,
} from "@/lib/auth/create-firebase-session-cookie";
import {
  requirePrincipalType,
} from "@/lib/auth/require-principal-type";
import {
  AUTH_SESSION_CONFIG,
} from "@/lib/auth/session-config";
import {
  verifyFirebaseIdToken,
} from "@/lib/auth/verify-id-token";
import {
  hasValidOrigin,
} from "@/lib/security/has-valid-origin";
import {
  AUTH_PRINCIPAL_TYPES,
} from "@/types/auth";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  idToken: z.string().min(1),
});

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
};

function createAuthenticationFailedResponse() {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: "AUTHENTICATION_FAILED",
        message:
          "تعذّر تسجيل دخول الإدارة. حاول مجددًا.",
      },
    },
    {
      status: 401,
      headers: NO_STORE_HEADERS,
    },
  );
}

export async function POST(request: Request) {
  try {
    if (!hasValidOrigin(request)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_ORIGIN",
            message:
              "الطلب غير مسموح.",
          },
        },
        {
          status: 403,
          headers: NO_STORE_HEADERS,
        },
      );
    }

    // An admin unlock grant is required.
    const hasStealthAccess =
      await hasCurrentAdminStealthAccess();

    if (!hasStealthAccess) {
      return createAuthenticationFailedResponse();
    }

    const body = requestSchema.parse(
      await request.json(),
    );

    // Verify Firebase authentication.
    const decodedToken =
      await verifyFirebaseIdToken(
        body.idToken,
      );

    // Only admin accounts can create this session.
    requirePrincipalType(
      decodedToken,
      AUTH_PRINCIPAL_TYPES.ADMIN_ACCOUNT,
    );

    const currentTimeSeconds =
      Math.floor(Date.now() / 1000);

    const signInAgeSeconds =
      currentTimeSeconds -
      decodedToken.auth_time;

    if (
      signInAgeSeconds >
      AUTH_SESSION_CONFIG
        .RECENT_SIGN_IN_MAX_AGE_SECONDS
    ) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "RECENT_SIGN_IN_REQUIRED",
            message:
              "سجّل دخولك مجددًا للمتابعة.",
          },
        },
        {
          status: 401,
          headers: NO_STORE_HEADERS,
        },
      );
    }

    // Prepare the Firebase admin session.
    const sessionCookie =
      await createFirebaseSessionCookie(
        body.idToken,
        AUTH_SESSION_CONFIG.ADMIN_EXPIRES_IN_MS,
      );

    // Consume the unlock grant atomically.
    // If consumption fails, do not issue a session.
    const consumed =
      await consumeCurrentAdminStealthAccess();

    if (!consumed) {
      return createAuthenticationFailedResponse();
    }

    const response = NextResponse.json(
      {
        success: true,
        data: {
          principalType:
            AUTH_PRINCIPAL_TYPES.ADMIN_ACCOUNT,
        },
      },
      {
        headers: NO_STORE_HEADERS,
      },
    );

    // Create the Firebase admin session.
    response.cookies.set(
      AUTH_SESSION_CONFIG.COOKIE_NAMES.ADMIN,
      sessionCookie,
      {
        httpOnly: true,
        secure:
          process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: Math.floor(
          AUTH_SESSION_CONFIG.ADMIN_EXPIRES_IN_MS /
            1000,
        ),
      },
    );

    // Remove the temporary unlock cookie.
    response.cookies.set(
      ADMIN_STEALTH_ACCESS_CONFIG.COOKIE_NAME,
      "",
      {
        httpOnly: true,
        secure:
          process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        maxAge: 0,
      },
    );

    return response;
  } catch {
    return createAuthenticationFailedResponse();
  }
}
