import { SecurityError } from "./security-error";

export function isSecurityError(
  error: unknown,
): error is SecurityError {
  return error instanceof SecurityError;
}