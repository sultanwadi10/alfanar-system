export function normalizeOrderSearch(value: string): string {
  return value.normalize("NFKC")
    .replace(/[٠-٩۰-۹]/g, char => String(char.charCodeAt(0) - (char <= "٩" ? 0x660 : 0x6f0)))
    .replace(/[\u0610-\u061a\u064b-\u065f\u0670\u0640\u200e\u200f\u202a-\u202e]/g, "")
    .replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه")
    .toLowerCase().replace(/\s+/g, " ").trim();
}
export function usefulOrderSearch(value: string): boolean {
  const text = normalizeOrderSearch(value).replace(/^#\s*/, "");
  return /^\d{1,8}$/.test(text) || text.length >= 2;
}
export function orderNameMatches(name: string, query: string): boolean {
  const normalized = normalizeOrderSearch(name);
  return normalizeOrderSearch(query).split(" ").filter(Boolean).every(word => normalized.includes(word));
}
