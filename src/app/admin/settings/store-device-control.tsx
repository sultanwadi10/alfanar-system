"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import styles from "./settings.module.css";

export type StoreDeviceSummary = {
  id: string;
  name: string;
  createdAt: string;
  lastSeenAt: string;
  revokedAt: string | null;
};

type StoreDeviceControlProps = {
  initialDevices:
    StoreDeviceSummary[];
};

function formatDateTime(
  value: string,
) {
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

function formatPairingCode(
  value: string,
) {
  return value.length === 8
    ? `${value.slice(0, 4)} ${value.slice(4)}`
    : value;
}

export function StoreDeviceControl({
  initialDevices,
}: StoreDeviceControlProps) {
  const [devices, setDevices] =
    useState<StoreDeviceSummary[]>(
      initialDevices,
    );

  const [pairingCode, setPairingCode] =
    useState("");

  const [pairingExpiresAt, setPairingExpiresAt] =
    useState<string | null>(null);

  const [secondsLeft, setSecondsLeft] =
    useState(0);

  const [loadingAction, setLoadingAction] =
    useState("");

  const [message, setMessage] =
    useState("");

  const [errorMessage, setErrorMessage] =
    useState("");

  const activeDevices =
    useMemo(
      () =>
        devices.filter(
          (device) =>
            !device.revokedAt,
        ),
      [devices],
    );

  const refreshDevices =
    useCallback(
      async (
        silent = false,
      ) => {
        if (!silent) {
          setLoadingAction(
            "refresh",
          );

          setErrorMessage("");
        }

        try {
          const response =
            await fetch(
              "/api/admin/store-devices",
              {
                cache: "no-store",
              },
            );

          const data =
            await response.json();

          if (
            !response.ok ||
            data.success !== true
          ) {
            if (!silent) {
              setErrorMessage(
                data?.error?.message ??
                "تعذر تحديث قائمة الأجهزة.",
              );
            }

            return;
          }

          setDevices(
            data.data.devices,
          );
        } catch {
          if (!silent) {
            setErrorMessage(
              "تعذر الاتصال بالخادم.",
            );
          }
        } finally {
          if (!silent) {
            setLoadingAction("");
          }
        }
      },
      [],
    );

  async function generatePairingCode() {
    if (loadingAction) {
      return;
    }

    setLoadingAction(
      "pairing",
    );
    setMessage("");
    setErrorMessage("");

    try {
      const response =
        await fetch(
          "/api/admin/store-devices/pairing-code",
          {
            method: "POST",
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
          "تعذر إنشاء رمز ربط الجهاز.",
        );
        return;
      }

      setPairingCode(
        data.data.code,
      );

      setPairingExpiresAt(
        data.data.expiresAt,
      );

      setMessage(
        "تم إنشاء رمز مؤقت. استخدمه على جهاز المحل فقط.",
      );
    } catch {
      setErrorMessage(
        "تعذر الاتصال بالخادم.",
      );
    } finally {
      setLoadingAction("");
    }
  }

  async function revokeDevice(
    device:
      StoreDeviceSummary,
  ) {
    if (
      loadingAction ||
      device.revokedAt
    ) {
      return;
    }

    const confirmed =
      window.confirm(
        [
          `إلغاء صلاحية الجهاز: ${device.name}؟`,
          "",
          "سيتم رفض جلسة المحل على هذا الجهاز فورًا عند أول فحص أمني، ولن يستطيع الدخول مجددًا إلا بربطه من جديد.",
          "",
          "الشفت والمبيعات لا يتم حذفهما.",
        ].join("\n"),
      );

    if (!confirmed) {
      return;
    }

    setLoadingAction(
      device.id,
    );
    setMessage("");
    setErrorMessage("");

    try {
      const response =
        await fetch(
          `/api/admin/store-devices/${encodeURIComponent(device.id)}/revoke`,
          {
            method: "POST",
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
          "تعذر إلغاء صلاحية الجهاز.",
        );
        return;
      }

      setMessage(
        "تم إلغاء صلاحية الجهاز.",
      );

      await refreshDevices(
        true,
      );
    } catch {
      setErrorMessage(
        "تعذر الاتصال بالخادم.",
      );
    } finally {
      setLoadingAction("");
    }
  }

  useEffect(() => {
    if (!pairingExpiresAt) {
      return;
    }

    function updateCountdown() {
      const remaining =
        Math.max(
          0,
          Math.ceil(
            (
              new Date(
                pairingExpiresAt!,
              ).getTime() -
              Date.now()
            ) /
              1000,
          ),
        );

      setSecondsLeft(
        remaining,
      );

      if (remaining === 0) {
        setPairingCode("");
        setPairingExpiresAt(null);
      }
    }

    updateCountdown();

    const interval =
      window.setInterval(
        updateCountdown,
        1000,
      );

    return () =>
      window.clearInterval(
        interval,
      );
  }, [pairingExpiresAt]);

  useEffect(() => {
    if (!pairingCode) {
      return;
    }

    const interval =
      window.setInterval(
        () => {
          void refreshDevices(
            true,
          );
        },
        5000,
      );

    return () =>
      window.clearInterval(
        interval,
      );
  }, [
    pairingCode,
    refreshDevices,
  ]);

  return (
    <section
      className={
        styles.deviceCard
      }
    >
      <div
        className={
          styles.deviceHeader
        }
      >
        <div>
          <span
            className={
              styles.sectionLabel
            }
          >
            DEVICE PAIRING
          </span>

          <h2>
            أجهزة المحل المصرح بها
          </h2>

          <p>
            حساب المحل وحده لا يكفي. يجب أن يحمل المتصفح اعتماد جهاز سري صادر من الإدارة.
          </p>
        </div>

        <div
          className={
            styles.deviceCount
          }
        >
          {activeDevices.length}
          <span>
            جهاز فعال
          </span>
        </div>
      </div>

      <div
        className={
          styles.deviceActions
        }
      >
        <button
          type="button"
          className={
            styles.pairButton
          }
          onClick={() =>
            void generatePairingCode()
          }
          disabled={
            Boolean(
              loadingAction,
            )
          }
        >
          {loadingAction ===
          "pairing"
            ? "جاري إنشاء الرمز..."
            : "ربط جهاز جديد"}
        </button>

        <button
          type="button"
          className={
            styles.secondaryButton
          }
          onClick={() =>
            void refreshDevices()
          }
          disabled={
            Boolean(
              loadingAction,
            )
          }
        >
          تحديث الأجهزة
        </button>
      </div>

      {pairingCode && (
        <div
          className={
            styles.pairingCodePanel
          }
        >
          <div>
            <span>
              رمز مؤقت لربط جهاز واحد
            </span>

            <strong>
              {formatPairingCode(
                pairingCode,
              )}
            </strong>
          </div>

          <div
            className={
              styles.pairingTimer
            }
          >
            <span>
              ينتهي خلال
            </span>

            <strong>
              {Math.floor(
                secondsLeft / 60,
              )}
              :
              {String(
                secondsLeft % 60,
              ).padStart(2, "0")}
            </strong>
          </div>

          <p>
            على شاشة الساعة في جهاز المحل: اضغط على منطقة الساعة 7 مرات بسرعة، ثم أدخل الرمز واسم الجهاز.
          </p>
        </div>
      )}

      {errorMessage && (
        <div
          className={
            styles.errorBox
          }
        >
          {errorMessage}
        </div>
      )}

      {message && (
        <div
          className={
            styles.successBox
          }
        >
          {message}
        </div>
      )}

      <div
        className={
          styles.deviceList
        }
      >
        {devices.length === 0 ? (
          <div
            className={
              styles.deviceEmpty
            }
          >
            لا يوجد أي جهاز مربوط حتى الآن.
          </div>
        ) : (
          devices.map(
            (device) => {
              const revoked =
                Boolean(
                  device.revokedAt,
                );

              return (
                <article
                  key={device.id}
                  className={
                    styles.deviceRow
                  }
                >
                  <div
                    className={
                      styles.deviceIdentity
                    }
                  >
                    <div
                      className={
                        revoked
                          ? styles.deviceIconRevoked
                          : styles.deviceIcon
                      }
                    >
                      {revoked
                        ? "×"
                        : "✓"}
                    </div>

                    <div>
                      <strong>
                        {device.name}
                      </strong>

                      <span>
                        آخر ظهور: {formatDateTime(device.lastSeenAt)}
                      </span>

                      <span>
                        تم الربط: {formatDateTime(device.createdAt)}
                      </span>
                    </div>
                  </div>

                  <div
                    className={
                      styles.deviceStatusArea
                    }
                  >
                    <span
                      className={
                        revoked
                          ? styles.revokedDeviceBadge
                          : styles.activeDeviceBadge
                      }
                    >
                      {revoked
                        ? "ملغي"
                        : "فعال"}
                    </span>

                    {!revoked && (
                      <button
                        type="button"
                        className={
                          styles.revokeButton
                        }
                        onClick={() =>
                          void revokeDevice(
                            device,
                          )
                        }
                        disabled={
                          Boolean(
                            loadingAction,
                          )
                        }
                      >
                        {loadingAction ===
                        device.id
                          ? "جاري الإلغاء..."
                          : "إلغاء الجهاز"}
                      </button>
                    )}
                  </div>
                </article>
              );
            },
          )
        )}
      </div>

      <div
        className={
          styles.deviceSecurityNote
        }
      >
        <strong>
          طبقات الوصول الحالية
        </strong>

        <p>
          جهاز مصرح + حساب المحل + PIN الموظف + شفت صحيح. إلغاء الجهاز لا يغلق الشفت ولا يحذف أي عملية محفوظة.
        </p>
      </div>
    </section>
  );
}
