import { NextResponse } from "next/server";
import { z } from "zod";

import { createFirebaseSessionCookie } from "@/lib/auth/create-firebase-session-cookie";
import { requirePrincipalType } from "@/lib/auth/require-principal-type";
import { AUTH_SESSION_CONFIG } from "@/lib/auth/session-config";
import { verifyFirebaseIdToken } from "@/lib/auth/verify-id-token";
import { AUTH_PRINCIPAL_TYPES } from "@/types/auth";

const requestSchema = z.object({
  idToken: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    const requestOrigin = new URL(request.url).origin;

    if (!origin || origin !== requestOrigin) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_ORIGIN",
            message: "The request origin is not allowed.",
          },
        },
        {
          status: 403,
        },
      );
    }

    const body = requestSchema.parse(await request.json());

    const decodedToken = await verifyFirebaseIdToken(body.idToken);

    requirePrincipalType(
      decodedToken,
      AUTH_PRINCIPAL_TYPES.STORE_ACCOUNT,
    );

    const currentTimeSeconds = Math.floor(Date.now() / 1000);
    const signInAgeSeconds =
      currentTimeSeconds - decodedToken.auth_time;

    if (
      signInAgeSeconds >
      AUTH_SESSION_CONFIG.RECENT_SIGN_IN_MAX_AGE_SECONDS
    ) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "RECENT_SIGN_IN_REQUIRED",
            message: "A recent sign-in is required.",
          },
        },
        {
          status: 401,
        },
      );
    }

    const sessionCookie = await createFirebaseSessionCookie(
      body.idToken,
      AUTH_SESSION_CONFIG.STORE_EXPIRES_IN_MS,
    );

    const response = NextResponse.json({
      success: true,
      data: {
        principalType: AUTH_PRINCIPAL_TYPES.STORE_ACCOUNT,
      },
    });

    response.cookies.set(
      AUTH_SESSION_CONFIG.COOKIE_NAMES.STORE,
      sessionCookie,
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: Math.floor(
          AUTH_SESSION_CONFIG.STORE_EXPIRES_IN_MS / 1000,
        ),
      },
    );

    return response;
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "AUTHENTICATION_FAILED",
          message: "The store session could not be created.",
        },
      },
      {
        status: 401,
      },
    );
  }
}