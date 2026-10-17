"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import styles from "./page.module.css";

const STORE_TIME_ZONE =
  "Asia/Amman";

const SECRET_TAP_COUNT = 7;
const SECRET_TAP_WINDOW_MS = 4000;
const PAIRING_VISIBILITY_CHECK_MS = 1500;

function formatTime(
  date: Date,
) {
  return new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone:
        STORE_TIME_ZONE,

      hour:
        "numeric",

      minute:
        "2-digit",

      hour12:
        true,
    },
  ).format(date);
}

function formatDay(
  date: Date,
) {
  return new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone:
        STORE_TIME_ZONE,

      weekday:
        "long",
    },
  ).format(date);
}

function formatDate(
  date: Date,
) {
  return new Intl.DateTimeFormat(
    "en-GB",
    {
      timeZone:
        STORE_TIME_ZONE,

      day:
        "numeric",

      month:
        "long",

      year:
        "numeric",
    },
  ).format(date);
}

function normalizePairingCode(
  value: string,
) {
  const digits =
    value.replace(/\D/g, "")
      .slice(0, 8);

  return digits.length > 4
    ? `${digits.slice(0, 4)} ${digits.slice(4)}`
    : digits;
}

export default function Home() {
  const [now, setNow] =
    useState<Date | null>(null);

  const [pairingOpen, setPairingOpen] =
    useState(false);

  const [pairingCode, setPairingCode] =
    useState("");

  const [deviceName, setDeviceName] =
    useState("Store Device");

  const [pairingError, setPairingError] =
    useState("");

  const [pairingLoading, setPairingLoading] =
    useState(false);

  const [entryLoading, setEntryLoading] =
    useState(false);

  const tapCountRef =
    useRef(0);

  const tapWindowStartedAtRef =
    useRef(0);

  useEffect(() => {
    function updateClock() {
      setNow(
        new Date(),
      );
    }

    updateClock();

    const interval =
      window.setInterval(
        updateClock,
        1000,
      );

    return () => {
      window.clearInterval(
        interval,
      );
    };
  }, []);

  useEffect(() => {
    if (!pairingOpen) {
      return;
    }

    let cancelled = false;

    function hidePairing() {
      if (cancelled) {
        return;
      }

      setPairingOpen(false);
      setPairingCode("");
      setPairingError("");
    }

    async function verifyPairingStillAllowed() {
      try {
        const response =
          await fetch(
            "/api/store-device/entry",
            {
              method: "GET",
              cache: "no-store",
            },
          );

        if (cancelled) {
          return;
        }

        if (response.status === 204) {
          hidePairing();
          return;
        }

        const data =
          await response.json();

        if (
          !response.ok ||
          data.success !== true ||
          data.mode !==
            "PAIR_REQUIRED"
        ) {
          hidePairing();
        }
      } catch {
        hidePairing();
      }
    }

    void verifyPairingStillAllowed();

    const intervalId =
      window.setInterval(
        () => {
          void verifyPairingStillAllowed();
        },
        PAIRING_VISIBILITY_CHECK_MS,
      );

    return () => {
      cancelled = true;

      window.clearInterval(
        intervalId,
      );
    };
  }, [pairingOpen]);

  async function requestEntry() {
    if (entryLoading) {
      return;
    }

    setEntryLoading(true);

    try {
      const response =
        await fetch(
          "/api/store-device/entry",
          {
            method: "GET",
            cache: "no-store",
          },
        );

      if (response.status === 204) {
        setPairingOpen(false);
        setPairingCode("");
        setPairingError("");
        return;
      }

      const data =
        await response.json();

      if (
        !response.ok ||
        data.success !== true
      ) {
        return;
      }

      if (
        data.mode ===
        "PAIR_REQUIRED"
      ) {
        setPairingError("");
        setPairingOpen(true);
        return;
      }

      if (
        data.mode === "ENTER" &&
        typeof data.destination ===
          "string"
      ) {
        window.location.replace(
          data.destination,
        );
      }
    } catch {
      setPairingOpen(false);
      setPairingCode("");
      setPairingError("");
    } finally {
      setEntryLoading(false);
    }
  }

  function handleSecretTap() {
    const nowMs =
      Date.now();

    if (
      nowMs -
        tapWindowStartedAtRef.current >
      SECRET_TAP_WINDOW_MS
    ) {
      tapWindowStartedAtRef.current =
        nowMs;

      tapCountRef.current = 0;
    }

    if (
      tapCountRef.current === 0
    ) {
      tapWindowStartedAtRef.current =
        nowMs;
    }

    tapCountRef.current += 1;

    if (
      tapCountRef.current >=
      SECRET_TAP_COUNT
    ) {
      tapCountRef.current = 0;
      tapWindowStartedAtRef.current = 0;

      void requestEntry();
    }
  }

  async function pairDevice(
    event:
      React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (pairingLoading) {
      return;
    }

    setPairingLoading(true);
    setPairingError("");

    try {
      const response =
        await fetch(
          "/api/store-device/pair",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                code:
                  pairingCode,

                deviceName:
                  deviceName.trim(),
              }),
          },
        );

      if (response.status === 404) {
        setPairingOpen(false);
        setPairingCode("");
        setPairingError("");
        return;
      }

      const data =
        await response.json();

      if (
        !response.ok ||
        data.success !== true
      ) {
        setPairingError(
          data?.error?.message ??
          "Unable to connect this device.",
        );

        return;
      }

      setPairingOpen(false);
      setPairingCode("");
      setPairingError("");

      await requestEntry();
    } catch {
      setPairingOpen(false);
      setPairingCode("");
      setPairingError("");
    } finally {
      setPairingLoading(false);
    }
  }

  return (
    <main
      className={
        styles.page
      }
    >
      <section
        className={
          styles.clock
        }
        aria-label="Clock"
        onPointerUp={
          handleSecretTap
        }
      >
        <div
          className={
            styles.time
          }
        >
          {now
            ? formatTime(
                now,
              )
            : "--:--"}
        </div>

        <div
          className={
            styles.dateBlock
          }
        >
          <span>
            {now
              ? formatDay(
                  now,
                )
              : ""}
          </span>

          <strong>
            {now
              ? formatDate(
                  now,
                )
              : ""}
          </strong>
        </div>
      </section>

      {pairingOpen && (
        <div
          className={
            styles.pairingOverlay
          }
          role="presentation"
        >
          <section
            className={
              styles.pairingCard
            }
            role="dialog"
            aria-modal="true"
            aria-labelledby="device-setup-title"
          >
            <div
              className={
                styles.pairingHeader
              }
            >
              <div>
                <span>
                  Local access
                </span>

                <h1
                  id="device-setup-title"
                >
                  Device setup
                </h1>
              </div>

              <button
                type="button"
                className={
                  styles.closeButton
                }
                onClick={() => {
                  setPairingOpen(false);
                  setPairingError("");
                }}
                disabled={
                  pairingLoading
                }
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <p
              className={
                styles.pairingDescription
              }
            >
              Enter the temporary access code for this device.
            </p>

            <form
              className={
                styles.pairingForm
              }
              onSubmit={
                pairDevice
              }
            >
              <label>
                Access code

                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={
                    pairingCode
                  }
                  onChange={(event) =>
                    setPairingCode(
                      normalizePairingCode(
                        event.target.value,
                      ),
                    )
                  }
                  placeholder="0000 0000"
                  disabled={
                    pairingLoading
                  }
                  required
                />
              </label>

              <label>
                Device name

                <input
                  type="text"
                  value={
                    deviceName
                  }
                  onChange={(event) =>
                    setDeviceName(
                      event.target.value,
                    )
                  }
                  minLength={2}
                  maxLength={40}
                  autoComplete="off"
                  disabled={
                    pairingLoading
                  }
                  required
                />
              </label>

              {pairingError && (
                <div
                  className={
                    styles.pairingError
                  }
                  role="alert"
                >
                  {pairingError}
                </div>
              )}

              <button
                type="submit"
                className={
                  styles.connectButton
                }
                disabled={
                  pairingLoading
                }
              >
                {pairingLoading
                  ? "Connecting..."
                  : "Connect device"}
              </button>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
