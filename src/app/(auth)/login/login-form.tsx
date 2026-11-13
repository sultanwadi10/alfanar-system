"use client";
import { userMessage } from "@/lib/client/user-message";

import {
  useState,
} from "react";
import {
  useRouter,
} from "next/navigation";
import {
  browserSessionPersistence,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";

import {
  getFirebaseClientAuth,
} from "@/lib/firebase/client";

import { LoginAppearance } from "./login-appearance";
import styles from "./login.module.css";

type LoginTarget =
  | "admin"
  | "store";

type LoginFormProps = {
  target:
    LoginTarget;
};

export function LoginForm({
  target,
}: LoginFormProps) {
  const router =
    useRouter();

  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [showPassword, setShowPassword] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  async function handleLogin(
    event:
      React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setLoading(true);
    setErrorMessage("");

    try {
      const auth =
        getFirebaseClientAuth();

      await setPersistence(
        auth,
        browserSessionPersistence,
      );

      const credential =
        await signInWithEmailAndPassword(
          auth,
          email.trim(),
          password,
        );

      const idToken =
        await credential.user.getIdToken(
          true,
        );

      const endpoint =
        target === "admin"
          ? "/api/auth/session/admin"
          : "/api/auth/session/store";

      const response =
        await fetch(
          endpoint,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                idToken,
              }),
          },
        );

      const data =
        await response.json();

      await signOut(auth);

      if (
        !response.ok ||
        data.success !== true
      ) {
        setErrorMessage(
          userMessage(target === "admin"
            ? "تعذر تسجيل الدخول كمسؤول. تأكد من الحساب والصلاحية."
            : "تعذر تسجيل الدخول إلى حساب المحل. تأكد من الحساب والصلاحية."),
        );

        return;
      }

      router.replace(
        target === "admin"
          ? "/admin"
          : "/employee",
      );

      router.refresh();
    } catch {
      setErrorMessage(
        userMessage("بيانات تسجيل الدخول غير صحيحة أو تعذر الاتصال بالخدمة."),
      );
    } finally {
      setLoading(false);
    }
  }

  const isAdmin = target === "admin";
  return (
    <LoginAppearance target={target}>
      <section className={styles.loginCard} aria-labelledby="login-heading">
        <header className={styles.header}>
          <h1 id="login-heading">تسجيل الدخول</h1>
          <span className={styles.targetBadge}>{isAdmin ? "الإدارة" : "المحل"}</span>
        </header>
        <form className={styles.form} onSubmit={handleLogin} aria-busy={loading}>
          <div className={styles.field}>
            <label htmlFor="login-email">البريد الإلكتروني</label>
            <input id="login-email" name="email" type="email" dir="ltr" inputMode="email" autoCapitalize="none" spellCheck={false}
              value={email} onChange={event => setEmail(event.target.value)} placeholder="name@example.com"
              autoComplete="username" disabled={loading} required />
          </div>
          <div className={styles.field}>
            <label htmlFor="login-password">كلمة المرور</label>
            <div className={styles.passwordField}>
              <input id="login-password" name="password" dir="ltr" type={showPassword ? "text" : "password"}
                value={password} onChange={event => setPassword(event.target.value)} placeholder="••••••••"
                autoComplete="current-password" disabled={loading} required />
              <button type="button" className={styles.showPasswordButton} onClick={() => setShowPassword(current => !current)}
                aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"} aria-pressed={showPassword} aria-controls="login-password" disabled={loading}>
                <svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  {showPassword ? <><path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M6.1 6.1C4.1 7.4 2.5 9.4 1.5 12c2 5 5.5 7.5 10.5 7.5 2.2 0 4.2-.5 5.9-1.6M9 4.8c1-.2 2-.3 3-.3 5 0 8.5 2.5 10.5 7.5-.8 2-1.8 3.6-3.1 4.8"/></> : <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>}
                </svg>
              </button>
            </div>
          </div>
          {errorMessage && <div className={styles.errorMessage} role="alert">{errorMessage}</div>}
          <button type="submit" className={styles.loginButton} disabled={loading}>
            {loading && <span className={styles.spinner} aria-hidden="true"/>}
            {loading ? "جارٍ تسجيل الدخول…" : "دخول"}
          </button>
        </form>
      </section>
    </LoginAppearance>
  );
}
