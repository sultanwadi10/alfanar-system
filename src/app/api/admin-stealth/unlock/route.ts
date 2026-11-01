
import {
  NextResponse,
} from "next/server";
import { z } from "zod";

import {
  ADMIN_STEALTH_ACCESS_CONFIG,
  buildAdminStealthRequestFingerprint,
  createAdminStealthAccessGrant,
  verifyAdminStealthUnlock,
} from "@/lib/admin/admin-stealth-access";

import {
  hasValidOrigin,
} from "@/lib/security/has-valid-origin";



export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control":
    "private, no-store, no-cache, max-age=0, must-revalidate",
};

const requestSchema = z.object({
  code: z.string().regex(/^\d{12}$/),
});

function createNeutralResponse() {
  return new NextResponse(null, {
    status: 204,
    headers: NO_STORE_HEADERS,
  });
}

export async function POST(request: Request) {
  try {
    if (!hasValidOrigin(request)) {
      return createNeutralResponse();
    }

   

    const body = requestSchema.safeParse(
      await request.json(),
    );

    if (!body.success) {
      return createNeutralResponse();
    }

    const allowed =
      await verifyAdminStealthUnlock({
        code: body.data.code,
        fingerprint:
          buildAdminStealthRequestFingerprint(
            request,
          ),
      });

    if (!allowed) {
      return createNeutralResponse();
    }

    const grant =
      await createAdminStealthAccessGrant();

    const response = NextResponse.json(
      {
        success: true,
      },
      {
        headers: NO_STORE_HEADERS,
      },
    );

    response.cookies.set(
      ADMIN_STEALTH_ACCESS_CONFIG.COOKIE_NAME,
      grant.cookieValue,
      {
        httpOnly: true,
        secure:
          process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        maxAge: Math.floor(
          ADMIN_STEALTH_ACCESS_CONFIG
            .ACCESS_EXPIRES_IN_MS / 1000,
        ),
      },
    );

    return response;
  } catch {
    // Fail closed without revealing the admin entry.
    return createNeutralResponse();
  }
}
