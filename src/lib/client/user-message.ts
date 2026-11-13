// Keep technical/server details out of the shop interface.
export function userMessage(value: unknown): string {
  if (value == null || value === "") return "";
  if (typeof value !== "string") return "تعذّر إتمام العملية. حاول مجددًا.";
  if (!value.trim()) return "";
  if (/[\u0600-\u06ff]/.test(value)) return value;
  if (/session|sign.in|unauthenticated/i.test(value)) return "انتهت جلسة الدخول. سجّل دخولك مجددًا.";
  if (/fetch|network|load failed|connection/i.test(value)) return "تعذّر الاتصال. تحقق من الإنترنت وحاول مجددًا.";
  if (/permission|forbidden|not authorized|not allowed/i.test(value)) return "ليس لديك صلاحية لتنفيذ هذه العملية.";
  if (/invalid|expected|required|too (big|small)|must be|out of range/i.test(value)) return "تحقق من البيانات المدخلة وحاول مجددًا.";
  return "تعذّر إتمام العملية. حاول مجددًا.";
}
