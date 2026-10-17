export function hasValidOrigin(
  request: Request,
) {
  const origin =
    request.headers.get("origin");

  const host =
    request.headers.get("host") ??
    request.headers.get(
      "x-forwarded-host",
    );

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

    return (
      originUrl.host ===
        requestHost &&
      (
        originUrl.protocol ===
          "http:" ||
        originUrl.protocol ===
          "https:"
      )
    );
  } catch {
    return false;
  }
}