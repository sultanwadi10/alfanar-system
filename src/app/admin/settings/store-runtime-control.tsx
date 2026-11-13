"use client";
import { userMessage } from "@/lib/client/user-message";
import { useTransientMessage } from "@/lib/client/use-transient-message";
import { useConfirmation } from "@/lib/client/use-confirmation";

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
    "en-GB",
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
  const { confirm, confirmationDialog } = useConfirmation();
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
  useTransientMessage(successMessage, setSuccessMessage);

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
        await confirm({"title":"إيقاف نظام المحل؟","description":"سيتم تسجيل خروج الموظفين.","confirmLabel":"إيقاف النظام","tone":"danger"});

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
          userMessage(data?.error?.message ??
          "تعذر تغيير حالة النظام."),
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
          ? "تم إيقاف نظام المحل."
          : "تم تشغيل نظام المحل.",
      );
    } catch {
      setErrorMessage(
        userMessage("تعذّر الاتصال. حاول مجددًا."),
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


          </>
        ) : (
          <>
            <strong>
              الوصول من أجهزة المحل
              مقفول.
            </strong>


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


    {confirmationDialog}
    </div>
  );
}