"use client";

import {
  useState,
} from "react";

import styles from "./settings.module.css";

type RuntimeStatus =
  | "RUNNING"
  | "STOPPED";

type RuntimeState = {
  status:
    RuntimeStatus;

  updatedAt:
    string | null;
};

type StoreRuntimeControlProps = {
  initialState:
    RuntimeState;
};

function formatUpdatedAt(
  value:
    string | null,
) {
  if (!value) {
    return "لم يتم تغييره بعد";
  }

  return new Intl.DateTimeFormat(
    "ar-JO",
    {
      timeZone:
        "Asia/Amman",

      dateStyle:
        "medium",

      timeStyle:
        "short",
    },
  ).format(
    new Date(value),
  );
}

export function StoreRuntimeControl({
  initialState,
}: StoreRuntimeControlProps) {
  const [
    state,
    setState,
  ] =
    useState<RuntimeState>(
      initialState,
    );

  const [
    loading,
    setLoading,
  ] =
    useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] =
    useState("");

  const [
    successMessage,
    setSuccessMessage,
  ] =
    useState("");

  const isRunning =
    state.status ===
    "RUNNING";

  async function changeStatus(
    nextStatus:
      RuntimeStatus,
  ) {
    if (loading) {
      return;
    }

    if (
      nextStatus ===
      "STOPPED"
    ) {
      const confirmed =
        window.confirm(
          [
            "إيقاف نظام المحل؟",
            "",
            "سيتم إبطال جلسة المحل الحالية وتسجيل خروج الموظف وإخفاء واجهة التشغيل.",
            "",
            "الشفت المفتوح والمبيعات المسجلة لن يتم حذفها أو إغلاقها.",
          ].join("\n"),
        );

      if (!confirmed) {
        return;
      }
    }

    setLoading(
      true,
    );

    setErrorMessage("");

    setSuccessMessage("");

    try {
      const response =
        await fetch(
          "/api/admin/store-runtime",
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                status:
                  nextStatus,
              }),
          },
        );

      const data =
        await response.json();

      if (
        !response.ok ||
        data.success !== true
      ) {
        setErrorMessage(
          data?.error?.message ??
          "تعذر تغيير حالة النظام.",
        );

        return;
      }

      setState({
        status:
          data.data.status,

        updatedAt:
          data.data.updatedAt,
      });

      setSuccessMessage(
        nextStatus ===
          "STOPPED"
          ? "تم إيقاف وصول أجهزة المحل وإبطال الجلسات الحالية."
          : "تم السماح بتشغيل نظام المحل من جديد.",
      );
    } catch {
      setErrorMessage(
        "تعذر الاتصال بالخادم.",
      );
    } finally {
      setLoading(
        false,
      );
    }
  }

  return (
    <div
      className={
        styles.runtimeCard
      }
    >
      <div
        className={
          styles.runtimeHeader
        }
      >
        <div>
          <span
            className={
              styles.sectionLabel
            }
          >
            التحكم الفوري
          </span>

          <h2>
            حالة نظام المحل
          </h2>
        </div>

        <div
          className={
            isRunning
              ? styles.runningBadge
              : styles.stoppedBadge
          }
        >
          <span />

          {isRunning
            ? "يعمل الآن"
            : "متوقف"}
        </div>
      </div>

      <div
        className={
          styles.runtimeDescription
        }
      >
        {isRunning ? (
          <>
            <strong>
              أجهزة المحل مسموح
              لها بالعمل.
            </strong>

            <p>
              الجلسات الصالحة تستطيع
              استخدام نظام الموظفين
              والبيع والشفتات.
            </p>
          </>
        ) : (
          <>
            <strong>
              الوصول من أجهزة المحل
              مقفول.
            </strong>

            <p>
              جلسات المحل القديمة
              أصبحت غير صالحة ولن
              تعود للعمل عند إعادة
              تشغيل النظام.
            </p>
          </>
        )}
      </div>

      <div
        className={
          styles.securityInfo
        }
      >
        <div>
          <span>
            آخر تغيير
          </span>

          <strong>
            {formatUpdatedAt(
              state.updatedAt,
            )}
          </strong>
        </div>

        <div>
          <span>
            الشفت المفتوح
          </span>

          <strong>
            لا يتم إغلاقه
          </strong>
        </div>

        <div>
          <span>
            المبيعات
          </span>

          <strong>
            تبقى محفوظة
          </strong>
        </div>
      </div>

      {errorMessage && (
        <div
          className={
            styles.errorBox
          }
        >
          {errorMessage}
        </div>
      )}

      {successMessage && (
        <div
          className={
            styles.successBox
          }
        >
          {successMessage}
        </div>
      )}

      <div
        className={
          styles.runtimeActions
        }
      >
        {isRunning ? (
          <button
            type="button"
            className={
              styles.stopButton
            }
            disabled={
              loading
            }
            onClick={() =>
              void changeStatus(
                "STOPPED",
              )
            }
          >
            {loading
              ? "جاري الإيقاف..."
              : "إيقاف نظام المحل"}
          </button>
        ) : (
          <button
            type="button"
            className={
              styles.startButton
            }
            disabled={
              loading
            }
            onClick={() =>
              void changeStatus(
                "RUNNING",
              )
            }
          >
            {loading
              ? "جاري التشغيل..."
              : "تشغيل نظام المحل"}
          </button>
        )}
      </div>

      <div
        className={
          styles.warningBox
        }
      >
        <strong>
          ملاحظة أمنية
        </strong>

        <p>
          إيقاف النظام لا يعني
          إنهاء الشفت. وظيفته إبطال
          وصول جهاز المحل وإجباره
          على تسجيل دخول جديد عند
          إعادة السماح بالتشغيل.
        </p>
      </div>
    </div>
  );
}