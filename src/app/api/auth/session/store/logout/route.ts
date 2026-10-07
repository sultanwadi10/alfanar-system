import { NextResponse } from "next/server";

import { AUTH_SESSION_CONFIG } from "@/lib/auth/session-config";

export async function POST(request: Request) {
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

  const response = NextResponse.json({
    success: true,
    data: {
      loggedOut: true,
    },
  });

  response.cookies.set(
    AUTH_SESSION_CONFIG.COOKIE_NAMES.STORE,
    "",
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    },
  );

  return response;
}