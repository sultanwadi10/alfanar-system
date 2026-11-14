"use client";

import { useRef, useState, type FormEvent } from "react";
import { requestPasswordReset } from "@/lib/client/password-reset";
import styles from "./login.module.css";

export function PasswordResetForm({ initialEmail, target, onBack }: {
  initialEmail: string;
  target: "admin" | "store";
  onBack: (email: string) => void;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || sent) return;
    pending.current = true;
    setLoading(true);
    setError("");
    try {
      const result = await requestPasswordReset(email);
      if (result.success) setSent(true);
      else setError(result.message);
    } finally {
      pending.current = false;
      setLoading(false);
    }
  }

  return (
    <section className={styles.loginCard} aria-labelledby="reset-heading">
      <header className={styles.header}>
        <h1 id="reset-heading">استعادة كلمة المرور</h1>
        <span className={styles.targetBadge}>{target === "admin" ? "الإدارة" : "المحل"}</span>
      </header>
      <form className={styles.form} onSubmit={submit} aria-busy={loading}>
        <div className={styles.field}>
          <label htmlFor="reset-email">البريد الإلكتروني</label>
          <input id="reset-email" name="email" type="email" dir="ltr" inputMode="email"
            autoComplete="email" autoCapitalize="none" spellCheck={false} required maxLength={254}
            placeholder="name@example.com" value={email} disabled={loading}
            onChange={event => { setEmail(event.target.value); setSent(false); setError(""); }} />
        </div>
        {sent && <div className={styles.successMessage} role="status">
          إذا كان البريد مسجلًا، سيصلك رابط لتغيير كلمة المرور. تحقق من البريد الوارد والرسائل غير المرغوب فيها.
        </div>}
        {error && <div className={styles.errorMessage} role="alert">{error}</div>}
        <button type="submit" className={styles.loginButton} disabled={loading || sent}>
          {loading && <span className={styles.spinner} aria-hidden="true" />}
          {loading ? "جارٍ الإرسال…" : sent ? "تم طلب الرابط" : "إرسال رابط التغيير"}
        </button>
        <button type="button" className={styles.textButton} disabled={loading} onClick={() => onBack(email.trim())}>
          الرجوع لتسجيل الدخول
        </button>
      </form>
    </section>
  );
}
