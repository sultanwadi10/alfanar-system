// Capacities are compared as numbers; labels such as ٢٠ لتر and 20 L
// describe the same delivery bottle. No matching by display name alone.
export function capacityMl(value: string): number {
  const normalized = value.normalize("NFKC").replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 1632)).replace(/٫/g, ".").trim().toLowerCase();
  const match = normalized.match(/(\d+(?:\.\d+)?)\s*(مل|ml|لتر|ليتر|litres?|liters?|l)(?:\b|$|\s)/u);
  if (!match) return 0;
  const ml = Number(match[1]) * (/^(مل|ml)$/.test(match[2]) ? 1 : 1000);
  return Number.isSafeInteger(ml) && ml > 0 && ml <= 100000 ? ml : 0;
}
export const coolerType = (type: string) => type === "CUPS" || type === "SHRINK";
