export function phoneDigits(value: string): string {
  return value.replace(/[٠-٩]/g,d=>String(d.charCodeAt(0)-1632)).replace(/[۰-۹]/g,d=>String(d.charCodeAt(0)-1776));
}

export function jordanPhoneMaxLength(value: string): number {
  if(value.startsWith("00"))return 14;
  if(value.startsWith("+"))return 13;
  if(value.startsWith("962"))return 12;
  return 10;
}

export function limitJordanPhoneInput(value: string): string {
  const digits=phoneDigits(value).replace(/[^\d+]/g,"");
  const compact=(digits.startsWith("+")?"+":"")+digits.replace(/\D/g,"");
  return compact.slice(0,jordanPhoneMaxLength(compact));
}

export function normalizeJordanPhone(
  value: string,
): string | null {
  const normalized=phoneDigits(value);
  if(!/^[+\d\s().-]+$/.test(normalized))return null;
  const compact = normalized
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
