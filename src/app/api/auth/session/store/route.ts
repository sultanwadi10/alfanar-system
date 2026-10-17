import {
  NextResponse,
} from "next/server";
import { z } from "zod";

import {
  createFirebaseSessionCookie,
} from "@/lib/auth/create-firebase-session-cookie";
import {
  OPERATOR_SESSION_CONFIG,
} from "@/lib/auth/operator-session-config";
import {
  revokeCurrentOperatorSession,
} from "@/lib/auth/operator-session";
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
  verifyFirebaseSessionCookie,
} from "@/lib/auth/verify-firebase-session-cookie";
import {
  hasValidOrigin,
} from "@/lib/security/has-valid-origin";
import {
  requirePairedStoreDevice,
} from "@/lib/store/store-device-repository";
import {
  getStoreRuntimeState,
  isStoreSessionAllowed,
  STORE_RUNTIME_STATUSES,
} from "@/lib/store/store-runtime-repository";
import {
  AUTH_PRINCIPAL_TYPES,
} from "@/types/auth";

const requestSchema =
  z.object({
    idToken:
      z.string().min(1),
  });

function clearStoreCookies(
  response: NextResponse,
) {
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

  response.cookies.set(
    AUTH_SESSION_CONFIG
      .COOKIE_NAMES.STORE,
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
}

function createUnavailableResponse() {
  const response =
    NextResponse.json(
      {
        success: false,

        error: {
          code:
            "SERVICE_UNAVAILABLE",

          message:
            "Service is temporarily unavailable.",
        },
      },
      {
        status: 503,
      },
    );

  clearStoreCookies(
    response,
  );

  return response;
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
     * Knowing the Store Firebase credentials is not enough.
     * The browser itself must first be paired by Admin.
     */
    await requirePairedStoreDevice();

    const body =
      requestSchema.parse(
        await request.json(),
      );

    const decodedToken =
      await verifyFirebaseIdToken(
        body.idToken,
      );

    requirePrincipalType(
      decodedToken,
      AUTH_PRINCIPAL_TYPES.STORE_ACCOUNT,
    );

    const currentTimeSeconds =
      Math.floor(
        Date.now() /
          1000,
      );

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
            code:
              "RECENT_SIGN_IN_REQUIRED",

            message:
              "A recent sign-in is required.",
          },
        },
        {
          status: 401,
        },
      );
    }

    const runtimeBefore =
      await getStoreRuntimeState();

    if (
      runtimeBefore.status ===
      STORE_RUNTIME_STATUSES.STOPPED
    ) {
      try {
        await revokeCurrentOperatorSession();
      } catch (error) {
        console.error(
          "Failed to revoke operator session while store runtime is stopped:",
          error,
        );
      }

      return createUnavailableResponse();
    }

    await revokeCurrentOperatorSession();

    const sessionCookie =
      await createFirebaseSessionCookie(
        body.idToken,
        AUTH_SESSION_CONFIG
          .STORE_EXPIRES_IN_MS,
      );

    const decodedSession =
      await verifyFirebaseSessionCookie(
        sessionCookie,
      );

    requirePrincipalType(
      decodedSession,
      AUTH_PRINCIPAL_TYPES.STORE_ACCOUNT,
    );

    const runtimeAfter =
      await getStoreRuntimeState();

    if (
      !isStoreSessionAllowed(
        runtimeAfter,
        decodedSession.iat,
      )
    ) {
      return createUnavailableResponse();
    }

    /*
     * Protect against device revocation during the login request.
     */
    await requirePairedStoreDevice();

    const response =
      NextResponse.json({
        success: true,

        data: {
          principalType:
            AUTH_PRINCIPAL_TYPES
              .STORE_ACCOUNT,
        },
      });

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

    response.cookies.set(
      AUTH_SESSION_CONFIG
        .COOKIE_NAMES.STORE,
      sessionCookie,
      {
        httpOnly: true,

        secure:
          process.env.NODE_ENV ===
          "production",

        sameSite: "lax",

        path: "/",

        maxAge:
          Math.floor(
            AUTH_SESSION_CONFIG
              .STORE_EXPIRES_IN_MS /
              1000,
          ),
      },
    );

    return response;
  } catch {
    return NextResponse.json(
      {
        success: false,

        error: {
          code:
            "AUTHENTICATION_FAILED",

          message:
            "The store session could not be created.",
        },
      },
      {
        status: 401,
      },
    );
  }
}
