
import { NextResponse } from "next/server";

import {
  ADMIN_STEALTH_ACCESS_CONFIG,
  revokeCurrentAdminStealthAccess,
} from "@/lib/admin/admin-stealth-access";
import {
  AUTH_SESSION_CONFIG,
} from "@/lib/auth/session-config";
import {
  hasValidOrigin,
} from "@/lib/security/has-valid-origin";

export async function POST(request: Request) {
  if (!hasValidOrigin(request)) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INVALID_ORIGIN",
          message: "الطلب غير مسموح.",
        },
      },
      { status: 403 },
    );
  }

  // Revoke the temporary admin entry grant.
  // Logout must continue even if Firestore cleanup fails.
  await revokeCurrentAdminStealthAccess()
    .catch(() => {});

  const response = NextResponse.json(
    {
      success: true,
      data: {
        loggedOut: true,
      },
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );

  // Clear Firebase admin session.
  response.cookies.set(
    AUTH_SESSION_CONFIG.COOKIE_NAMES.ADMIN,
    "",
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    },
  );

  // Clear admin stealth entry grant.
  response.cookies.set(
    ADMIN_STEALTH_ACCESS_CONFIG.COOKIE_NAME,
    "",
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 0,
    },
  );

  return response;
}
