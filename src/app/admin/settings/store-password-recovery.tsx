"use client";

import { useState } from "react";
import { PasswordResetForm } from "@/app/(auth)/login/password-reset-form";
import styles from "./settings.module.css";

// This entry is rendered only inside the existing protected admin layout.
// Requesting a reset link does not log out the store or close its open shift.
export function StorePasswordRecovery() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");

  if (open) {
    return <div className={styles.recoveryHost}>
      <PasswordResetForm target="store" initialEmail={email} backLabel="إغلاق"
        onBack={address => { setEmail(address); setOpen(false); }} />
    </div>;
  }

  return <section className={styles.runtimeCard} aria-labelledby="store-password-heading">
    <header className={styles.runtimeHeader}>
      <h2 id="store-password-heading">كلمة مرور حساب المحل</h2>
    </header>
    <button type="button" className={styles.recoveryButton} onClick={() => setOpen(true)}>
      إرسال رابط تغيير كلمة المرور
    </button>
  </section>;
}
