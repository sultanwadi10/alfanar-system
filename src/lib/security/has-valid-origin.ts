// Only this exact deployed origin may use the proxy-host fallback. Other
// Firebase tenants and arbitrary forwarded hosts must remain cross-origin.
const FIREBASE_APP_ORIGIN =
  "https://alfanar-system--alfanar-system.europe-west4.hosted.app";

function allowedProxyOrigins() {
  const origins = new Set([FIREBASE_APP_ORIGIN]);
  // Configure additional verified custom domains when connecting them.
  for (const value of (process.env.APP_ALLOWED_ORIGINS ?? "").split(",")) {
    const candidate = value.trim();
    try {
      const url = new URL(candidate);
      if (url.protocol === "https:" && url.origin === candidate) origins.add(candidate);
    } catch {
      // Invalid configuration cannot grant access.
    }
  }
  return origins;
}

export function hasValidOrigin(
  request: Request,
) {
  const origin =
    request.headers.get("origin");

  const host =
    request.headers.get("host");

  if (
    !origin ||
    !host
  ) {
    return false;
  }

  try {
    const originUrl =
      new URL(origin);

    const requestHost =
      host
        .split(",")[0]
        ?.trim();

    if (!requestHost) {
      return false;
    }

    if (
      !["http:", "https:"].includes(originUrl.protocol) ||
      originUrl.origin !== origin
    ) return false;

    if (originUrl.host === requestHost) return true;

    // App Hosting sets Host to Cloud Run and forwards the public hostname.
    // Require both an exact HTTPS allowlist match and a single matching
    // forwarded host; trusting the forwarded header alone would allow spoofing.
    return originUrl.protocol === "https:" &&
      allowedProxyOrigins().has(originUrl.origin) &&
      request.headers.get("x-forwarded-host")?.trim() === originUrl.host;
  } catch {
    return false;
  }
}
