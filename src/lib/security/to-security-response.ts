import { NextResponse } from "next/server";

import type { ApiError } from "@/types/api";

import { SecurityError } from "./security-error";

const messages: Record<string, string> = {
  UNAUTHENTICATED: "سجّل دخولك للمتابعة.",
  INVALID_SESSION: "انتهت جلسة الدخول. سجّل دخولك مجددًا.",
  SESSION_EXPIRED: "انتهت جلسة الدخول. سجّل دخولك مجددًا.",
  FORBIDDEN: "ليس لديك صلاحية لتنفيذ هذه العملية.",
  PERMISSION_DENIED: "ليس لديك صلاحية لتنفيذ هذه العملية.",
  EMPLOYEE_DISABLED: "حساب الموظف معطّل. راجع الإدارة.",
  NO_ACTIVE_EMPLOYEE: "اختر الموظف وسجّل دخوله.",
  NO_ACTIVE_SHIFT: "افتح الشفت للمتابعة.",
};

export function toSecurityResponse(error: SecurityError) {
  const body: ApiError = {
    success: false,
    error: {
      code: error.code,
      message: /[\u0600-\u06ff]/.test(error.message) ? error.message : messages[error.code] ?? "تعذّر تنفيذ العملية. سجّل دخولك مجددًا.",
    },
  };

  return NextResponse.json(body, {
    status: error.statusCode,
  });
}
