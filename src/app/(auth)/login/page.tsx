"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  browserSessionPersistence,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";

import { getFirebaseClientAuth } from "@/lib/firebase/client";

import styles from "./login.module.css";

type LoginTarget = "admin" | "store";

export default function LoginPage() {
  const router = useRouter();

  const [target, setTarget] =
    useState<LoginTarget>("admin");

  const [email, setEmail] = useState("");
  const [password, setPassword] =
    useState("");

  const [showPassword, setShowPassword] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  async function handleLogin(
    event: React.FormEvent<HTMLFormElement>,
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

      const response = await fetch(
        endpoint,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            idToken,
          }),
        },
      );

      const data = await response.json();

      await signOut(auth);

      if (
        !response.ok ||
        data.success !== true
      ) {
        setErrorMessage(
          target === "admin"
            ? "تعذر تسجيل الدخول كمسؤول. تأكد من الحساب والصلاحية."
            : "تعذر تسجيل الدخول إلى حساب المحل. تأكد من الحساب والصلاحية.",
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
        "بيانات تسجيل الدخول غير صحيحة أو تعذر الاتصال بالخدمة.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      className={styles.page}
      dir="rtl"
    >
      <section
        className={styles.loginCard}
      >
        <header
          className={styles.header}
        >
          <div className={styles.brandMark}>
            A
          </div>

          <div>
            <p
              className={
                styles.companyName
              }
            >
              GLE TECHNOLOGY
            </p>

            <h1>نظام محطة الفنار</h1>

            <p
              className={
                styles.subtitle
              }
            >
              تسجيل الدخول إلى النظام
              الإداري والتشغيلي
            </p>
          </div>
        </header>

        <div
          className={
            styles.loginTypeSelector
          }
        >
          <button
            type="button"
            className={
              target === "admin"
                ? styles.activeType
                : styles.typeButton
            }
            onClick={() =>
              setTarget("admin")
            }
            disabled={loading}
          >
            الإدارة
          </button>

          <button
            type="button"
            className={
              target === "store"
                ? styles.activeType
                : styles.typeButton
            }
            onClick={() =>
              setTarget("store")
            }
            disabled={loading}
          >
            المحل
          </button>
        </div>

        <div
          className={styles.contextBox}
        >
          {target === "admin" ? (
            <>
              <strong>
                دخول الإدارة
              </strong>

              <span>
                مخصص لصاحب المحطة
                والإدارة.
              </span>
            </>
          ) : (
            <>
              <strong>
                دخول المحل
              </strong>

              <span>
                يفتح بيئة المحل،
                وبعدها يتم اختيار
                الموظف باستخدام PIN.
              </span>
            </>
          )}
        </div>

        <form
          className={styles.form}
          onSubmit={handleLogin}
        >
          <label>
            البريد الإلكتروني

            <input
              type="email"
              value={email}
              onChange={(event) =>
                setEmail(
                  event.target.value,
                )
              }
              placeholder="example@email.com"
              autoComplete="email"
              disabled={loading}
              required
            />
          </label>

          <label>
            كلمة المرور

            <div
              className={
                styles.passwordField
              }
            >
              <input
                type={
                  showPassword
                    ? "text"
                    : "password"
                }
                value={password}
                onChange={(event) =>
                  setPassword(
                    event.target.value,
                  )
                }
                placeholder="أدخل كلمة المرور"
                autoComplete="current-password"
                disabled={loading}
                required
              />

              <button
                type="button"
                className={
                  styles.showPasswordButton
                }
                onClick={() =>
                  setShowPassword(
                    (current) =>
                      !current,
                  )
                }
                disabled={loading}
              >
                {showPassword
                  ? "إخفاء"
                  : "إظهار"}
              </button>
            </div>
          </label>

          {errorMessage && (
            <div
              className={
                styles.errorMessage
              }
              role="alert"
            >
              {errorMessage}
            </div>
          )}

          <button
            type="submit"
            className={
              styles.loginButton
            }
            disabled={loading}
          >
            {loading
              ? "جاري تسجيل الدخول..."
              : target === "admin"
                ? "دخول الإدارة"
                : "دخول المحل"}
          </button>
        </form>

        <footer
          className={styles.footer}
        >
          Alfanar Water Station
          <span>•</span>
          GLE TECHNOLOGY
        </footer>
      </section>
    </main>
  );
}