export function normalizeJordanPhone(
  value: string,
): string | null {
  const compact = value
    .trim()
    .replace(/[^\d+]/g, "");

  if (/^07\d{8}$/.test(compact)) {
    return `+962${compact.slice(1)}`;
  }

  if (/^\+9627\d{8}$/.test(compact)) {
    return compact;
  }

  if (/^009627\d{8}$/.test(compact)) {
    return `+${compact.slice(2)}`;
  }

  if (/^9627\d{8}$/.test(compact)) {
    return `+${compact}`;
  }

  return null;
}

export function formatJordanPhoneLocal(
  phoneNormalized: string,
): string {
  if (
    /^\+9627\d{8}$/.test(
      phoneNormalized,
    )
  ) {
    return `0${phoneNormalized.slice(4)}`;
  }

  return phoneNormalized;
}