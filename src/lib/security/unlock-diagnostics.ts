type UnlockScope = "store" | "admin";
type UnlockStage = "origin" | "runtime" | "body" | "verify" | "grant";

function hostOnly(value: string | null) {
  if (!value) return null;
  try {
    return new URL(`https://${value.split(",")[0].trim()}`).host;
  } catch {
    return "invalid";
  }
}

/** Server logs only. Never include request bodies, secret values, or raw errors. */
export function logUnlockFailure(
  scope: UnlockScope,
  stage: UnlockStage,
  reason: string,
  request: Request,
  error?: unknown,
) {
  const code = error && typeof error === "object" && "code" in error
    ? error.code : undefined;
  const safeCodes = new Set([
    "app/invalid-credential", "app/invalid-app-options",
    "auth/invalid-credential", "ERR_REQUIRE_ESM",
    "PERMISSION_DENIED", "UNAUTHENTICATED", "UNAVAILABLE",
    "DEADLINE_EXCEEDED", "ENOTFOUND", "ECONNRESET",
  ]);
  console.warn(JSON.stringify({
    severity: "WARNING",
    event: "unlock_rejected",
    scope, stage, reason,
    errorCode: typeof code === "number" && Number.isInteger(code)
      ? code : typeof code === "string" && safeCodes.has(code) ? code : null,
    host: hostOnly(request.headers.get("host")),
    forwardedHost: hostOnly(request.headers.get("x-forwarded-host")),
    originHost: (() => {
      try { return new URL(request.headers.get("origin") ?? "").host; }
      catch { return null; }
    })(),
    configuredCodeValid: new RegExp(scope === "store" ? "^\\d{10}$" : "^\\d{12}$")
      .test((scope === "store" ? process.env.STORE_STEALTH_UNLOCK_CODE
        : process.env.ADMIN_STEALTH_UNLOCK_CODE)?.trim() ?? ""),
  }));
}
