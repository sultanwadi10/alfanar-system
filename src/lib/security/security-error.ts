import type { SecurityErrorCode } from "./security-error-codes";

export class SecurityError extends Error {
  readonly code: SecurityErrorCode;
  readonly statusCode: number;

  constructor(
    code: SecurityErrorCode,
    message: string,
    statusCode: number,
  ) {
    super(message);

    this.name = "SecurityError";
    this.code = code;
    this.statusCode = statusCode;
  }
}