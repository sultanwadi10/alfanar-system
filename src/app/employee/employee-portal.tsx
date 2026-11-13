"use client";
import { userMessage } from "@/lib/client/user-message";

import {
  type FormEvent,
  useEffect,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import styles from "./employee.module.css";
import StoreHome from "./store-home";

type EmployeeOption = {
  id: string;
  name: string;
};

type OperatorData = {
  employeeId: string;
  employeeName: string;
};

type ShiftData = {
  id: string;
  openedAt: string;
  openedByEmployeeName: string;
};

type PortalStage =
  | "LOADING"
  | "STORE_SIGNED_OUT"
  | "SELECT_EMPLOYEE"
  | "NO_SHIFT"
  | "HOME"
  | "SHIFT_BLOCKED"
  | "SHIFT_CLOSED";

type OperatorResult =
  | {
      type: "STORE_SIGNED_OUT";
    }
  | {
      type: "OPERATOR";
      operator: OperatorData;
    }
  | {
      type: "SELECT_EMPLOYEE";
      employees: EmployeeOption[];
    }
  | {
      type: "ERROR";
      message: string;
    };

type ShiftResult =
  | {
      type: "NO_SHIFT";
    }
  | {
      type: "OPEN_SHIFT";
      shift: ShiftData;
    }
  | {
      type: "ERROR";
      message: string;
    };

async function fetchOperatorState(): Promise<OperatorResult> {
  try {
    const response =
      await fetch(
        "/api/operator/session",
        {
          method: "GET",
          cache: "no-store",
        },
      );

    if (
      response.status === 401 ||
      response.status === 403
    ) {
      return {
        type:
          "STORE_SIGNED_OUT",
      };
    }

    const data =
      await response.json();

    if (
      !response.ok ||
      data.success !== true
    ) {
      return {
        type: "ERROR",

        message:
          data?.error?.message ??
          "تعذر تحميل نظام المحل.",
      };
    }

    if (
      data.data.stage ===
      "OPERATOR"
    ) {
      return {
        type: "OPERATOR",

        operator:
          data.data.operator,
      };
    }

    return {
      type:
        "SELECT_EMPLOYEE",

      employees:
        data.data.employees ??
        [],
    };
  } catch {
    return {
      type: "ERROR",

      message:
        "تعذّر الاتصال. حاول مجددًا.",
    };
  }
}

async function fetchShiftState(): Promise<ShiftResult> {
  try {
    const response =
      await fetch(
        "/api/operator/shift",
        {
          method: "GET",
          cache: "no-store",
        },
      );

    const data =
      await response.json();

    if (
      !response.ok ||
      data.success !== true
    ) {
      return {
        type: "ERROR",

        message:
          data?.error?.message ??
          "تعذر تحميل الشفت.",
      };
    }

    if (
      data.data.stage ===
      "NO_SHIFT"
    ) {
      return {
        type: "NO_SHIFT",
      };
    }

    return {
      type:
        "OPEN_SHIFT",

      shift:
        data.data.shift,
    };
  } catch {
    return {
      type: "ERROR",

      message:
        "تعذّر الاتصال. حاول مجددًا.",
    };
  }
}

function parsePriceToFils(
  value: string,
): number | null {
  const normalized =
    value.trim();

  if (
    !/^\d+(?:\.\d{1,3})?$/.test(
      normalized,
    )
  ) {
    return null;
  }

  const [
    wholePart,
    fractionPart = "",
  ] =
    normalized.split(".");

  const whole =
    Number(
      wholePart,
    );

  const fraction =
    Number(
      fractionPart.padEnd(
        3,
        "0",
      ),
    );

  const result =
    whole * 1000 +
    fraction;

  if (
    !Number.isSafeInteger(
      result,
    ) ||
    result < 0
  ) {
    return null;
  }

  return result;
}

export default function EmployeePortal() {
  const router =
    useRouter();

  const [
    stage,
    setStage,
  ] =
    useState<PortalStage>(
      "LOADING",
    );

  const [
    employees,
    setEmployees,
  ] =
    useState<
      EmployeeOption[]
    >([]);

  const [
    selectedEmployeeId,
    setSelectedEmployeeId,
  ] =
    useState("");

  const [
    operator,
    setOperator,
  ] =
    useState<
      OperatorData | null
    >(null);

  const [
    shift,
    setShift,
  ] =
    useState<
      ShiftData | null
    >(null);

  const [
    pin,
    setPin,
  ] =
    useState("");

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
    blockedShiftMessage,
    setBlockedShiftMessage,
  ] =
    useState("");

  const [
    closeModalOpen,
    setCloseModalOpen,
  ] =
    useState(false);

  const [
    actualCash,
    setActualCash,
  ] =
    useState("");

  const [
    cashConfirmed,
    setCashConfirmed,
  ] =
    useState(false);

  const [
    closeLoading,
    setCloseLoading,
  ] =
    useState(false);

  useEffect(() => {
    if(operator?.employeeId)window.dispatchEvent(new CustomEvent("alfanar:operator-ready",{detail:operator.employeeId}));
  },[operator?.employeeId]);

  useEffect(() => {
    let cancelled =
      false;

    async function initialize() {
      const operatorResult =
        await fetchOperatorState();

      if (cancelled) {
        return;
      }

      if (
        operatorResult.type ===
        "STORE_SIGNED_OUT"
      ) {
        setStage(
          "STORE_SIGNED_OUT",
        );

        return;
      }

      if (
        operatorResult.type ===
        "ERROR"
      ) {
        setErrorMessage(
          userMessage(operatorResult.message),
        );

        setStage(
          "SELECT_EMPLOYEE",
        );

        return;
      }

      if (
        operatorResult.type ===
        "SELECT_EMPLOYEE"
      ) {
        setEmployees(
          operatorResult.employees,
        );

        setStage(
          "SELECT_EMPLOYEE",
        );

        return;
      }

      setOperator(
        operatorResult.operator,
      );

      const shiftResult =
        await fetchShiftState();

      if (cancelled) {
        return;
      }

      if (
        shiftResult.type ===
        "ERROR"
      ) {
        setBlockedShiftMessage(
          shiftResult.message,
        );

        setStage(
          "SHIFT_BLOCKED",
        );

        return;
      }

      if (
        shiftResult.type ===
        "NO_SHIFT"
      ) {
        setStage(
          "NO_SHIFT",
        );

        return;
      }

      setShift(
        shiftResult.shift,
      );

      setStage(
        "HOME",
      );
    }

    void initialize();

    return () => {
      cancelled =
        true;
    };
  }, []);

  async function loadEmployeeSelection() {
    const result =
      await fetchOperatorState();

    if (
      result.type ===
      "SELECT_EMPLOYEE"
    ) {
      setEmployees(
        result.employees,
      );

      setOperator(null);
      setShift(null);

      setSelectedEmployeeId(
        "",
      );

      setPin("");

      setErrorMessage("");

      setStage(
        "SELECT_EMPLOYEE",
      );

      return;
    }

    if (
      result.type ===
      "STORE_SIGNED_OUT"
    ) {
      setStage(
        "STORE_SIGNED_OUT",
      );

      return;
    }

    if (
      result.type ===
      "ERROR"
    ) {
      setErrorMessage(
        userMessage(result.message),
      );
    }
  }

  async function applyShiftAfterLogin(
    employee:
      OperatorData,
  ) {
    setOperator(
      employee,
    );

    const shiftResult =
      await fetchShiftState();

    if (
      shiftResult.type ===
      "ERROR"
    ) {
      setBlockedShiftMessage(
        shiftResult.message,
      );

      setStage(
        "SHIFT_BLOCKED",
      );

      return;
    }

    if (
      shiftResult.type ===
      "NO_SHIFT"
    ) {
      setShift(null);

      setStage(
        "NO_SHIFT",
      );

      return;
    }

    setShift(
      shiftResult.shift,
    );

    setStage(
      "HOME",
    );
  }

  async function handleLogin(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (
      !selectedEmployeeId
    ) {
      setErrorMessage(
        userMessage("اختر اسم الموظف أولًا."),
      );

      return;
    }

    if (
      !/^\d{4,6}$/.test(
        pin,
      )
    ) {
      setErrorMessage(
        userMessage("أدخل PIN من 4 إلى 6 أرقام."),
      );

      return;
    }

    setLoading(true);

    setErrorMessage("");

    try {
      const response =
        await fetch(
          "/api/operator/session",
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                employeeId:
                  selectedEmployeeId,

                pin,
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
          "تعذر تسجيل الدخول."),
        );

        setPin("");

        return;
      }

      setPin("");

      await applyShiftAfterLogin({
        employeeId:
          data.data.employee.id,

        employeeName:
          data.data.employee.name,
      });
    } catch {
      setErrorMessage(
        userMessage("تعذّر الاتصال. حاول مجددًا."),
      );
    } finally {
      setLoading(false);
    }
  }

  async function startCurrentShift() {
    if (loading) {
      return;
    }

    setLoading(true);

    setErrorMessage("");

    try {
      const response =
        await fetch(
          "/api/operator/shift",
          {
            method:
              "POST",
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
          "تعذر بدء الشفت."),
        );

        return;
      }

      setShift(
        data.data.shift,
      );

      setStage(
        "HOME",
      );
    } catch {
      setErrorMessage(
        userMessage("تعذّر الاتصال. حاول مجددًا."),
      );
    } finally {
      setLoading(false);
    }
  }

  async function switchEmployee() {
    if (loading) {
      return;
    }

    setLoading(true);

    setErrorMessage("");

    try {
      const response =
        await fetch(
          "/api/operator/session",
          {
            method:
              "DELETE",
          },
        );

      if (!response.ok) {
        const data =
          await response.json();

        setErrorMessage(
          userMessage(data?.error?.message ??
          "تعذر تبديل الموظف."),
        );

        return;
      }

      setOperator(null);
      setShift(null);

      await loadEmployeeSelection();
    } catch {
      setErrorMessage(
        userMessage("تعذّر الاتصال. حاول مجددًا."),
      );
    } finally {
      setLoading(false);
    }
  }

  async function openCloseShift() {
    if (closeLoading) {
      return;
    }

    setCloseLoading(
      true,
    );

    setErrorMessage("");

    try {
      /*
       * هذا الـendpoint لا يعيد
       * أي قيمة مالية للموظف.
       *
       * فقط يتأكد أن هذا الموظف
       * يملك الشفت المفتوح.
       */
      const response =
        await fetch(
          "/api/operator/shift/close-preview",
          {
            method:
              "GET",

            cache:
              "no-store",
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
          "تعذر تجهيز إنهاء الشفت."),
        );

        return;
      }

      setActualCash("");

      setCashConfirmed(
        false,
      );

      setCloseModalOpen(
        true,
      );
    } catch {
      setErrorMessage(
        userMessage("تعذّر الاتصال. حاول مجددًا."),
      );
    } finally {
      setCloseLoading(
        false,
      );
    }
  }

  async function confirmCloseShift(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    if (closeLoading || !shift) return;

    const actualCashFils =
      parsePriceToFils(
        actualCash,
      );

    if (
      actualCashFils ===
      null
    ) {
      setErrorMessage(
        userMessage("أدخل مبلغ الكاش الموجود فعليًا بشكل صحيح."),
      );

      return;
    }

    if (!cashConfirmed) {
      setErrorMessage(
        userMessage("أكد أن المبلغ المدخل هو الكاش الموجود فعليًا في الصندوق."),
      );

      return;
    }

    setCloseLoading(
      true,
    );

    setErrorMessage("");

    try {
      const response =
        await fetch(
          "/api/operator/shift/close",
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                actualCashFils,
                shiftId: shift.id,
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
          "تعذر إنهاء الشفت."),
        );

        return;
      }

      /*
       * بعد إنهاء الشفت ننهي
       * Operator Session كذلك.
       *
       * Store Session تبقى موجودة.
       */
      await fetch(
        "/api/operator/session",
        {
          method:
            "DELETE",
        },
      );

      setCloseModalOpen(
        false,
      );

      setActualCash("");

      setCashConfirmed(
        false,
      );

      setShift(null);

      setOperator(null);

      setStage(
        "SHIFT_CLOSED",
      );
    } catch {
      setErrorMessage(
        userMessage("تعذّر الاتصال. حاول مجددًا."),
      );
    } finally {
      setCloseLoading(
        false,
      );
    }
  }

  if (
    stage ===
    "LOADING"
  ) {
    return (
      <main
        className={
          styles.page
        }
        dir="rtl"
      >
        <div
          className={
            styles.loadingCard
          }
        >
          <div
            className={
              styles.spinner
            }
          />

          <strong>
            جاري تجهيز نظام
            المحل...
          </strong>

          <span>
            لحظات ويتم تحميل
            جلسة التشغيل.
          </span>
        </div>
      </main>
    );
  }

  if (
    stage ===
    "STORE_SIGNED_OUT"
  ) {
    return (
      <main
        className={
          styles.page
        }
        dir="rtl"
      >
        <section
          className={
            styles.loginCard
          }
        >
          <div
            className={
              styles.brandMark
            }
          >
            ف
          </div>

          <div
            className={
              styles.loginHeading
            }
          >
            <span>
              محطة الفنار
            </span>

            <h1>
              جلسة المحل غير مسجلة
            </h1>

            <p>
              سجل دخول الحساب
              المشترك للمحل أولًا.
            </p>
          </div>

          <button
            type="button"
            className={
              styles.primaryButton
            }
            onClick={() =>
              router.push(
                "/login",
              )
            }
          >
            تسجيل الدخول
          </button>
        </section>
      </main>
    );
  }

  if (
    stage ===
    "SELECT_EMPLOYEE"
  ) {
    return (
      <main
        className={
          styles.page
        }
        dir="rtl"
      >
        <section
          className={
            styles.loginCard
          }
        >
          <div
            className={
              styles.brandMark
            }
          >
            ف
          </div>

          <div
            className={
              styles.loginHeading
            }
          >
            <span>
              نظام محطة الفنار
            </span>

            <h1>
              من يعمل الآن؟
            </h1>


          </div>

          <form
            onSubmit={
              handleLogin
            }
            className={
              styles.form
            }
          >
            {employees.length >
            0 ? (
              <div
                className={
                  styles.employeeGrid
                }
              >
                {employees.map(
                  (employee) => {
                    const selected =
                      selectedEmployeeId ===
                      employee.id;

                    return (
                      <button
                        key={
                          employee.id
                        }
                        type="button"
                        className={`${styles.employeeButton} ${
                          selected
                            ? styles.employeeButtonSelected
                            : ""
                        }`}
                        onClick={() => {
                          setSelectedEmployeeId(
                            employee.id,
                          );

                          setPin("");

                          setErrorMessage(
                            "",
                          );
                        }}
                      >
                        <span
                          className={
                            styles.avatar
                          }
                        >
                          {employee.name
                            .trim()
                            .charAt(
                              0,
                            )}
                        </span>

                        <span
                          className={
                            styles.employeeButtonText
                          }
                        >
                          <strong>
                            {
                              employee.name
                            }
                          </strong>

                          <small>
                            اختيار الموظف
                          </small>
                        </span>
                      </button>
                    );
                  },
                )}
              </div>
            ) : (
              <div
                className={
                  styles.emptyEmployees
                }
              >
                لا يوجد موظفون
                فعّالون حاليًا.
              </div>
            )}

            {selectedEmployeeId && (
              <label
                className={
                  styles.pinField
                }
              >
                <span>
                  رمز PIN
                </span>

                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={6}
                  value={pin}
                  onChange={(
                    event,
                  ) =>
                    setPin(
                      event.target.value.replace(
                        /\D/g,
                        "",
                      ),
                    )
                  }
                  placeholder="••••"
                  autoFocus
                />
              </label>
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

            <button
              type="submit"
              className={
                styles.primaryButton
              }
              disabled={
                loading ||
                !selectedEmployeeId ||
                pin.length < 4
              }
            >
              {loading
                ? "جاري التحقق..."
                : "دخول إلى نظام المحل"}
            </button>
          </form>
        </section>
      </main>
    );
  }

  if (
    stage ===
    "SHIFT_BLOCKED"
  ) {
    return (
      <main
        className={
          styles.page
        }
        dir="rtl"
      >
        <section
          className={
            styles.blockedCard
          }
        >
          <div
            className={
              styles.blockedIcon
            }
          >
            !
          </div>

          <span
            className={
              styles.employeeWelcome
            }
          >
            {operator
              ? `مرحبًا، ${operator.employeeName}`
              : "محطة الفنار"}
          </span>

          <h1>
            لا يمكن استخدام الشفت
            الحالي
          </h1>

          <p>
            {blockedShiftMessage}
          </p>

          {errorMessage && (
            <div
              className={
                styles.errorBox
              }
            >
              {errorMessage}
            </div>
          )}

          <button
            type="button"
            className={
              styles.primaryButton
            }
            disabled={
              loading
            }
            onClick={() =>
              void switchEmployee()
            }
          >
            {loading
              ? "جاري التبديل..."
              : "اختيار موظف آخر"}
          </button>
        </section>
      </main>
    );
  }

  if (
    stage ===
      "NO_SHIFT" &&
    operator
  ) {
    return (
      <main
        className={
          styles.page
        }
        dir="rtl"
      >
        <section
          className={
            styles.shiftStartCard
          }
        >
          <div
            className={
              styles.brandMark
            }
          >
            ف
          </div>

          <span
            className={
              styles.employeeWelcome
            }
          >
            أهلًا،{" "}
            {
              operator.employeeName
            }
          </span>

          <h1>
            جاهز تبدأ دوامك؟
          </h1>



          <div
            className={
              styles.shiftReadyBox
            }
          >
            <div>
              <span
                className={
                  styles.liveDot
                }
              />

              <strong>
                الموظف مصرح له
                بالعمل الآن
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

          <button
            type="button"
            className={
              styles.primaryButton
            }
            disabled={
              loading
            }
            onClick={() =>
              void startCurrentShift()
            }
          >
            {loading
              ? "جاري بدء الشفت..."
              : "بدء الشفت"}
          </button>

          <button
            type="button"
            className={
              styles.textButton
            }
            disabled={
              loading
            }
            onClick={() =>
              void switchEmployee()
            }
          >
            اختيار موظف آخر
          </button>
        </section>
      </main>
    );
  }

  if (
    stage ===
    "SHIFT_CLOSED"
  ) {
    return (
      <main
        className={
          styles.page
        }
        dir="rtl"
      >
        <section
          className={
            styles.successCard
          }
        >
          <div
            className={
              styles.successIcon
            }
          >
            ✓
          </div>

          <span
            className={
              styles.employeeWelcome
            }
          >
            تم تسليم الجرد
          </span>

          <h1>
            تم إنهاء الشفت بنجاح
          </h1>

          <p>
            تم تسجيل التسليم وإغلاق الشفت.</p>

          <button
            type="button"
            className={
              styles.primaryButton
            }
            onClick={() =>
              void loadEmployeeSelection()
            }
          >
            اختيار الموظف التالي
          </button>
        </section>
      </main>
    );
  }

  if (
    stage ===
      "HOME" &&
    operator &&
    shift
  ) {
    return (
      <StoreHome
        employeeName={operator.employeeName}
        openedAt={shift.openedAt}
        switching={loading}
        closing={closeLoading}
        error={errorMessage}
        onSwitch={() => void switchEmployee()}
        onClose={() => void openCloseShift()}
      >
        {closeModalOpen && (
          <div
            className={
              styles.modalOverlay
            }
            role="dialog"
            aria-modal="true"
            aria-label="إنهاء الشفت"
          >
            <div
              className={
                styles.closeShiftModal
              }
            >
              <div
                className={
                  styles.modalTitle
                }
              >
                <span>
                  تسليم الشفت
                </span>

                <h2>
                  أدخل الكاش الموجود
                  في الصندوق
                </h2>


              </div>



              {errorMessage && <p role="alert" className={styles.homeError}>{errorMessage}</p>}
              <form
                onSubmit={
                  confirmCloseShift
                }
              >
                <label
                  className={
                    styles.cashField
                  }
                >
                  <span>
                    الكاش الموجود
                    فعليًا
                  </span>

                  <div
                    className={
                      styles.cashInputWrap
                    }
                  >
                    <input
                      type="text"
                      inputMode="decimal"
                      value={
                        actualCash
                      }
                      onChange={(
                        event,
                      ) =>
                        setActualCash(
                          event.target
                            .value,
                        )
                      }
                      placeholder="0.000"
                      autoFocus
                    />

                    <strong>
                      د.أ
                    </strong>
                  </div>
                </label>

                <label
                  className={
                    styles.confirmCheck
                  }
                >
                  <input
                    type="checkbox"
                    checked={
                      cashConfirmed
                    }
                    onChange={(
                      event,
                    ) =>
                      setCashConfirmed(
                        event.target
                          .checked,
                      )
                    }
                  />

                  <span>
                    أؤكد أن المبلغ
                    المدخل هو الكاش
                    الموجود فعليًا
                    في الصندوق.
                  </span>
                </label>

                <div
                  className={
                    styles.modalActions
                  }
                >
                  <button
                    type="submit"
                    className={
                      styles.confirmCloseButton
                    }
                    disabled={
                      closeLoading ||
                      !cashConfirmed ||
                      !actualCash.trim()
                    }
                  >
                    {closeLoading
                      ? "جاري التسليم..."
                      : "تسليم وإنهاء الشفت"}
                  </button>

                  <button
                    type="button"
                    className={
                      styles.cancelButton
                    }
                    disabled={
                      closeLoading
                    }
                    onClick={() => {
                      setCloseModalOpen(
                        false,
                      );

                      setActualCash(
                        "",
                      );

                      setCashConfirmed(
                        false,
                      );

                      setErrorMessage(
                        "",
                      );
                    }}
                  >
                    رجوع
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </StoreHome>
    );
  }

  return null;
}
