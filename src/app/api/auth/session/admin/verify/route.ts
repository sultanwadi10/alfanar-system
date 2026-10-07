import { NextResponse } from "next/server";

import { requireAdminSession } from "@/lib/auth/require-admin-session";
import { isSecurityError } from "@/lib/security/is-security-error";
import { toSecurityResponse } from "@/lib/security/to-security-response";

export async function GET() {
  try {
    const session = await requireAdminSession();

    return NextResponse.json({
      success: true,
      data: {
        uid: session.uid,
        principalType: session.principalType,
      },
    });
  } catch (error) {
    if (isSecurityError(error)) {
      return toSecurityResponse(error);
    }

    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Unexpected server error.",
        },
      },
      {
        status: 500,
      },
    );
  }
}