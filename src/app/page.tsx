"use client";

import {
  useEffect,
  useState,
} from "react";

import styles from "./page.module.css";

const STEALTH_CODE_DIGITS = 10;
const PAIRING_VISIBILITY_CHECK_MS = 1500;
const MAX_DISPLAY_LENGTH = 16;

type Operation =
  | "+"
  | "−"
  | "×"
  | "÷";

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

function normalizeNumberForDisplay(
  value: number,
) {
  if (!Number.isFinite(value)) {
    return "Error";
  }

  if (Object.is(value, -0)) {
    return "0";
  }

  const absolute =
    Math.abs(value);

  if (
    absolute !== 0 &&
    (
      absolute >= 1e12 ||
      absolute < 1e-9
    )
  ) {
    return value
      .toExponential(8)
      .replace(/\.0+e/, "e")
      .replace(/(\.\d*?[1-9])0+e/, "$1e");
  }

  return Number.parseFloat(
    value.toPrecision(12),
  ).toString();
}

function calculate(
  left: number,
  right: number,
  operation: Operation,
) {
  switch (operation) {
    case "+":
      return left + right;

    case "−":
      return left - right;

    case "×":
      return left * right;

    case "÷":
      return right === 0
        ? Number.NaN
        : left / right;
  }

  return Number.NaN;
}

function isUnlockCandidate(
  value: string,
) {
  return new RegExp(
    `^\\d{${STEALTH_CODE_DIGITS}}$`,
  ).test(value);
}

export default function Home() {
  const [display, setDisplay] =
    useState("0");

  const [accumulator, setAccumulator] =
    useState<number | null>(null);

  const [pendingOperation, setPendingOperation] =
    useState<Operation | null>(null);

  const [waitingForOperand, setWaitingForOperand] =
    useState(false);

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

  const [unlockLoading, setUnlockLoading] =
    useState(false);

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

  async function attemptStealthUnlock(
    code: string,
  ) {
    if (
      unlockLoading ||
      !isUnlockCandidate(
        code,
      )
    ) {
      return;
    }

    setUnlockLoading(true);

    try {
      const response =
        await fetch(
          "/api/store-device/unlock",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                code,
              }),
          },
        );

      if (
        response.status !== 200
      ) {
        return;
      }

      const data =
        await response.json();

      if (
        data.success === true
      ) {
        await requestEntry();
      }
    } catch {
      // Wrong/unavailable unlocks intentionally look like ordinary calculator use.
    } finally {
      setUnlockLoading(false);
    }
  }

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

  function resetCalculator() {
    setDisplay("0");
    setAccumulator(null);
    setPendingOperation(null);
    setWaitingForOperand(false);
  }

  function inputDigit(
    digit: string,
  ) {
    if (
      display === "Error" ||
      waitingForOperand
    ) {
      setDisplay(digit);
      setWaitingForOperand(false);
      return;
    }

    if (display === "0") {
      setDisplay(digit);
      return;
    }

    const digitCount =
      display.replace(
        /[^0-9]/g,
        "",
      ).length;

    if (
      digitCount >=
      MAX_DISPLAY_LENGTH
    ) {
      return;
    }

    setDisplay(
      `${display}${digit}`,
    );
  }

  function inputDecimal() {
    if (
      display === "Error" ||
      waitingForOperand
    ) {
      setDisplay("0.");
      setWaitingForOperand(false);
      return;
    }

    if (
      !display.includes(".")
    ) {
      setDisplay(
        `${display}.`,
      );
    }
  }

  function toggleSign() {
    if (
      display === "Error" ||
      display === "0"
    ) {
      return;
    }

    setDisplay(
      display.startsWith("-")
        ? display.slice(1)
        : `-${display}`,
    );
  }

  function applyPercent() {
    if (display === "Error") {
      resetCalculator();
      return;
    }

    const value =
      Number(display);

    setDisplay(
      normalizeNumberForDisplay(
        value / 100,
      ),
    );
  }

  function backspace() {
    if (
      display === "Error" ||
      waitingForOperand
    ) {
      setDisplay("0");
      setWaitingForOperand(false);
      return;
    }

    if (
      display.length <= 1 ||
      (
        display.startsWith("-") &&
        display.length === 2
      )
    ) {
      setDisplay("0");
      return;
    }

    setDisplay(
      display.slice(0, -1),
    );
  }

  function chooseOperation(
    nextOperation: Operation,
  ) {
    if (display === "Error") {
      resetCalculator();
      return;
    }

    const inputValue =
      Number(display);

    if (
      accumulator === null
    ) {
      setAccumulator(
        inputValue,
      );
    } else if (
      pendingOperation &&
      !waitingForOperand
    ) {
      const result =
        calculate(
          accumulator,
          inputValue,
          pendingOperation,
        );

      if (!Number.isFinite(result)) {
        setDisplay("Error");
        setAccumulator(null);
        setPendingOperation(null);
        setWaitingForOperand(true);
        return;
      }

      const formatted =
        normalizeNumberForDisplay(
          result,
        );

      setDisplay(
        formatted,
      );

      setAccumulator(
        result,
      );
    }

    setPendingOperation(
      nextOperation,
    );

    setWaitingForOperand(true);
  }

  function equals() {
    if (display === "Error") {
      resetCalculator();
      return;
    }

    if (
      accumulator !== null &&
      pendingOperation
    ) {
      const inputValue =
        Number(display);

      const result =
        calculate(
          accumulator,
          inputValue,
          pendingOperation,
        );

      if (!Number.isFinite(result)) {
        setDisplay("Error");
      } else {
        setDisplay(
          normalizeNumberForDisplay(
            result,
          ),
        );
      }

      setAccumulator(null);
      setPendingOperation(null);
      setWaitingForOperand(true);
      return;
    }

    if (
      isUnlockCandidate(
        display,
      )
    ) {
      void attemptStealthUnlock(
        display,
      );
    }

    setWaitingForOperand(true);
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
      className={styles.page}
    >
      <section
        className={styles.calculator}
        aria-label="Calculator"
      >
        <div
          className={styles.display}
          aria-live="polite"
          aria-atomic="true"
        >
          <span
            className={styles.operationHint}
            aria-hidden="true"
          >
            {pendingOperation ?? ""}
          </span>

          <output>
            {display}
          </output>
        </div>

        <div
          className={styles.keypad}
        >
          <button
            type="button"
            className={`${styles.key} ${styles.utility}`}
            onClick={resetCalculator}
          >
            AC
          </button>

          <button
            type="button"
            className={`${styles.key} ${styles.utility}`}
            onClick={toggleSign}
          >
            ±
          </button>

          <button
            type="button"
            className={`${styles.key} ${styles.utility}`}
            onClick={applyPercent}
          >
            %
          </button>

          <button
            type="button"
            className={`${styles.key} ${styles.operator}`}
            onClick={() => {
              chooseOperation("÷");
            }}
            aria-label="Divide"
          >
            ÷
          </button>

          <button
            type="button"
            className={`${styles.key} ${styles.number}`}
            onClick={() => {
              inputDigit("7");
            }}
          >
            7
          </button>

          <button
            type="button"
            className={`${styles.key} ${styles.number}`}
            onClick={() => {
              inputDigit("8");
            }}
          >
            8
          </button>

          <button
            type="button"
            className={`${styles.key} ${styles.number}`}
            onClick={() => {
              inputDigit("9");
            }}
          >
            9
          </button>

          <button
            type="button"
            className={`${styles.key} ${styles.operator}`}
            onClick={() => {
              chooseOperation("×");
            }}
            aria-label="Multiply"
          >
            ×
          </button>

          <button
            type="button"
            className={`${styles.key} ${styles.number}`}
            onClick={() => {
              inputDigit("4");
            }}
          >
            4
          </button>

          <button
            type="button"
            className={`${styles.key} ${styles.number}`}
            onClick={() => {
              inputDigit("5");
            }}
          >
            5
          </button>

          <button
            type="button"
            className={`${styles.key} ${styles.number}`}
            onClick={() => {
              inputDigit("6");
            }}
          >
            6
          </button>

          <button
            type="button"
            className={`${styles.key} ${styles.operator}`}
            onClick={() => {
              chooseOperation("−");
            }}
            aria-label="Subtract"
          >
            −
          </button>

          <button
            type="button"
            className={`${styles.key} ${styles.number}`}
            onClick={() => {
              inputDigit("1");
            }}
          >
            1
          </button>

          <button
            type="button"
            className={`${styles.key} ${styles.number}`}
            onClick={() => {
              inputDigit("2");
            }}
          >
            2
          </button>

          <button
            type="button"
            className={`${styles.key} ${styles.number}`}
            onClick={() => {
              inputDigit("3");
            }}
          >
            3
          </button>

          <button
            type="button"
            className={`${styles.key} ${styles.operator}`}
            onClick={() => {
              chooseOperation("+");
            }}
            aria-label="Add"
          >
            +
          </button>

          <button
            type="button"
            className={`${styles.key} ${styles.number}`}
            onClick={backspace}
            aria-label="Delete last digit"
          >
            ⌫
          </button>

          <button
            type="button"
            className={`${styles.key} ${styles.number}`}
            onClick={() => {
              inputDigit("0");
            }}
          >
            0
          </button>

          <button
            type="button"
            className={`${styles.key} ${styles.number}`}
            onClick={inputDecimal}
            aria-label="Decimal point"
          >
            .
          </button>

          <button
            type="button"
            className={`${styles.key} ${styles.equals}`}
            onClick={equals}
            aria-label="Equals"
          >
            =
          </button>
        </div>
      </section>

      {pairingOpen && (
        <div
          className={styles.pairingOverlay}
          role="presentation"
        >
          <section
            className={styles.pairingCard}
            role="dialog"
            aria-modal="true"
            aria-labelledby="device-setup-title"
          >
            <div
              className={styles.pairingHeader}
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
                className={styles.closeButton}
                onClick={() => {
                  setPairingOpen(false);
                  setPairingError("");
                }}
                disabled={pairingLoading}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <p
              className={styles.pairingDescription}
            >
              Enter the temporary access code for this device.
            </p>

            <form
              className={styles.pairingForm}
              onSubmit={pairDevice}
            >
              <label>
                Access code

                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={pairingCode}
                  onChange={(event) =>
                    setPairingCode(
                      normalizePairingCode(
                        event.target.value,
                      ),
                    )
                  }
                  placeholder="0000 0000"
                  disabled={pairingLoading}
                  required
                />
              </label>

              <label>
                Device name

                <input
                  type="text"
                  value={deviceName}
                  onChange={(event) =>
                    setDeviceName(
                      event.target.value,
                    )
                  }
                  minLength={2}
                  maxLength={40}
                  autoComplete="off"
                  disabled={pairingLoading}
                  required
                />
              </label>

              {pairingError && (
                <div
                  className={styles.pairingError}
                  role="alert"
                >
                  {pairingError}
                </div>
              )}

              <button
                type="submit"
                className={styles.connectButton}
                disabled={pairingLoading}
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
