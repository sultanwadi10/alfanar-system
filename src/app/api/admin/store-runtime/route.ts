import {
  NextResponse,
} from "next/server";
import { z } from "zod";

import {
  getAdminSecurityContext,
} from "@/lib/security/get-admin-security-context";
import {
  hasValidOrigin,
} from "@/lib/security/has-valid-origin";
import {
  isSecurityError,
} from "@/lib/security/is-security-error";
import {
  toSecurityResponse,
} from "@/lib/security/to-security-response";
import {
  getStoreRuntimeState,
  startStoreRuntime,
  stopStoreRuntime,
  STORE_RUNTIME_STATUSES,
  type StoreRuntimeState,
} from "@/lib/store/store-runtime-repository";

const updateSchema =
  z.object({
    status:
      z.enum([
        STORE_RUNTIME_STATUSES.RUNNING,
        STORE_RUNTIME_STATUSES.STOPPED,
      ]),
  });

function serializeState(
  state:
    StoreRuntimeState,
) {
  return {
    status:
      state.status,

    sessionInvalidBefore:
      state.sessionInvalidBefore
        ?.toISOString() ??
      null,

    updatedAt:
      state.updatedAt
        ?.toISOString() ??
      null,
  };
}

export async function GET() {
  try {
    await getAdminSecurityContext();

    const state =
      await getStoreRuntimeState();

    return NextResponse.json({
      success: true,

      data:
        serializeState(
          state,
        ),
    });
  } catch (error) {
    if (
      isSecurityError(
        error,
      )
    ) {
      return toSecurityResponse(
        error,
      );
    }

    console.error(
      "Failed to load store runtime state:",
      error,
    );

    return NextResponse.json(
      {
        success: false,

        error: {
          code:
            "INTERNAL_ERROR",

          message:
            "تعذر تحميل حالة نظام المحل.",
        },
      },
      {
        status: 500,
      },
    );
  }
}

export async function POST(
  request: Request,
) {
  try {
    await getAdminSecurityContext();

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
              "FORBIDDEN",

            message:
              "الطلب غير مسموح.",
          },
        },
        {
          status: 403,
        },
      );
    }

    let body: unknown;

    try {
      body =
        await request.json();
    } catch {
      return NextResponse.json(
        {
          success: false,

          error: {
            code:
              "INVALID_INPUT",

            message:
              "البيانات غير صالحة.",
          },
        },
        {
          status: 400,
        },
      );
    }

    const parsed =
      updateSchema.safeParse(
        body,
      );

    if (
      !parsed.success
    ) {
      return NextResponse.json(
        {
          success: false,

          error: {
            code:
              "VALIDATION_ERROR",

            message:
              "حالة النظام غير صالحة.",
          },
        },
        {
          status: 400,
        },
      );
    }

    const state =
      parsed.data.status ===
      STORE_RUNTIME_STATUSES.STOPPED
        ? await stopStoreRuntime()
        : await startStoreRuntime();

    return NextResponse.json({
      success: true,

      data:
        serializeState(
          state,
        ),
    });
  } catch (error) {
    if (
      isSecurityError(
        error,
      )
    ) {
      return toSecurityResponse(
        error,
      );
    }

    console.error(
      "Failed to update store runtime state:",
      error,
    );

    return NextResponse.json(
      {
        success: false,

        error: {
          code:
            "INTERNAL_ERROR",

          message:
            "تعذر تغيير حالة نظام المحل.",
        },
      },
      {
        status: 500,
      },
    );
  }
}