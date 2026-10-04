import { NextResponse } from "next/server";

import type { ApiError } from "@/types/api";

import { SecurityError } from "./security-error";

export function toSecurityResponse(error: SecurityError) {
  const body: ApiError = {
    success: false,
    error: {
      code: error.code,
      message: error.message,
    },
  };

  return NextResponse.json(body, {
    status: error.statusCode,
  });
}