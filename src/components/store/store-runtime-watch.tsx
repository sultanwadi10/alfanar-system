"use client";

import {
  type ReactNode,
  useEffect,
  useRef,
} from "react";

type StoreRuntimeWatchProps = {
  children:
    ReactNode;
};

export function StoreRuntimeWatch({
  children,
}: StoreRuntimeWatchProps) {
  const exitingRef =
    useRef(false);

  useEffect(() => {
    let cancelled =
      false;

    async function forceExit() {
      if (
        cancelled ||
        exitingRef.current
      ) {
        return;
      }

      exitingRef.current =
        true;

      try {
        /*
         * هذا endpoint الحالي عندك
         * يمسح Store + Operator cookies
         * ويحاول revoke للـOperator Session.
         */
        await fetch(
          "/api/auth/session/store/logout",
          {
            method:
              "POST",

            cache:
              "no-store",
          },
        );
      } catch {
        /*
         * حتى لو فشل الاتصال أثناء logout،
         * الجلسة القديمة مرفوضة Server-side
         * بسبب sessionInvalidBefore.
         */
      } finally {
        window.location.replace(
          "/",
        );
      }
    }

    async function check() {
      if (
        cancelled ||
        exitingRef.current
      ) {
        return;
      }

      if (
        document.visibilityState ===
        "hidden"
      ) {
        return;
      }

      try {
        const response =
          await fetch(
            "/api/pulse",
            {
              method:
                "GET",

              cache:
                "no-store",
            },
          );

        if (
          response.status ===
            401 ||
          response.status ===
            403 ||
          response.status ===
            423
        ) {
          await forceExit();
        }
      } catch {
        /*
         * Offline لا يعني Logout.
         *
         * عند رجوع الإنترنت نعمل check فورًا.
         *
         * ولو STOP حصل أثناء Offline ثم
         * START قبل رجوع الجهاز،
         * sessionInvalidBefore ستقتل
         * الجلسة القديمة عند أول check.
         */
      }
    }

    function handleVisible() {
      if (
        document.visibilityState ===
        "visible"
      ) {
        void check();
      }
    }

    function handleOnline() {
      void check();
    }

    function handleFocus() {
      void check();
    }

    void check();

    const intervalId =
      window.setInterval(
        () => {
          void check();
        },
        1500,
      );

    document.addEventListener(
      "visibilitychange",
      handleVisible,
    );

    window.addEventListener(
      "online",
      handleOnline,
    );

    window.addEventListener(
      "focus",
      handleFocus,
    );

    return () => {
      cancelled =
        true;

      window.clearInterval(
        intervalId,
      );

      document.removeEventListener(
        "visibilitychange",
        handleVisible,
      );

      window.removeEventListener(
        "online",
        handleOnline,
      );

      window.removeEventListener(
        "focus",
        handleFocus,
      );
    };
  }, []);

  return children;
}