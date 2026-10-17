"use client";

import {
  type FormEvent,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import type {
  EmployeeSchedule,
  EmployeeShiftTimeSettings,
  EmployeeShiftType,
  EmployeeWeekday,
} from "@/types/employee-schedule";

import scheduleStyles from "./employee-schedule.module.css";
import styles from "./employees.module.css";

type EmployeeView = {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
};

type ScheduleOption =
  | "REST"
  | "MORNING"
  | "EVENING"
  | "BOTH";

type EmployeesManagerProps = {
  employees:
    EmployeeView[];

  schedules: Record<
    string,
    EmployeeSchedule
  >;

  shiftSettings:
    EmployeeShiftTimeSettings;
};

const scheduleDays: Array<{
  key: EmployeeWeekday;
  label: string;
}> = [
  {
    key: "sunday",
    label: "الأحد",
  },
  {
    key: "monday",
    label: "الإثنين",
  },
  {
    key: "tuesday",
    label: "الثلاثاء",
  },
  {
    key: "wednesday",
    label: "الأربعاء",
  },
  {
    key: "thursday",
    label: "الخميس",
  },
  {
    key: "friday",
    label: "الجمعة",
  },
  {
    key: "saturday",
    label: "السبت",
  },
];

function createEmptySchedule(): EmployeeSchedule {
  return {
    sunday: [],
    monday: [],
    tuesday: [],
    wednesday: [],
    thursday: [],
    friday: [],
    saturday: [],
  };
}

function shiftsToOption(
  shifts:
    EmployeeShiftType[],
): ScheduleOption {
  const morning =
    shifts.includes(
      "MORNING",
    );

  const evening =
    shifts.includes(
      "EVENING",
    );

  if (
    morning &&
    evening
  ) {
    return "BOTH";
  }

  if (morning) {
    return "MORNING";
  }

  if (evening) {
    return "EVENING";
  }

  return "REST";
}

function optionToShifts(
  option:
    ScheduleOption,
): EmployeeShiftType[] {
  if (
    option ===
    "MORNING"
  ) {
    return [
      "MORNING",
    ];
  }

  if (
    option ===
    "EVENING"
  ) {
    return [
      "EVENING",
    ];
  }

  if (
    option ===
    "BOTH"
  ) {
    return [
      "MORNING",
      "EVENING",
    ];
  }

  return [];
}

export function EmployeesManager({
  employees,
  schedules,
  shiftSettings,
}: EmployeesManagerProps) {
  const router =
    useRouter();

  const [
    name,
    setName,
  ] =
    useState("");

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
    successMessage,
    setSuccessMessage,
  ] =
    useState("");

  const [
    showPin,
    setShowPin,
  ] =
    useState(false);

  const [
    actionEmployeeId,
    setActionEmployeeId,
  ] =
    useState<
      string | null
    >(null);

  const [
    scheduleDrafts,
    setScheduleDrafts,
  ] =
    useState<
      Record<
        string,
        EmployeeSchedule
      >
    >({});

  const [
    savingScheduleEmployeeId,
    setSavingScheduleEmployeeId,
  ] =
    useState<
      string | null
    >(null);

  const [
    morningStart,
    setMorningStart,
  ] =
    useState(
      shiftSettings.morningStart,
    );

  const [
    morningEnd,
    setMorningEnd,
  ] =
    useState(
      shiftSettings.morningEnd,
    );

  const [
    eveningStart,
    setEveningStart,
  ] =
    useState(
      shiftSettings.eveningStart,
    );

  const [
    eveningEnd,
    setEveningEnd,
  ] =
    useState(
      shiftSettings.eveningEnd,
    );

  const [
    savingSettings,
    setSavingSettings,
  ] =
    useState(false);

  function getEmployeeScheduleDraft(
    employeeId: string,
  ) {
    return (
      scheduleDrafts[
        employeeId
      ] ??
      schedules[
        employeeId
      ] ??
      createEmptySchedule()
    );
  }

  async function handleSubmit(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setLoading(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const response =
        await fetch(
          "/api/admin/employees",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                name,
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
          data?.error?.message ??
            "تعذر إضافة الموظف.",
        );

        return;
      }

      setName("");
      setPin("");

      setSuccessMessage(
        "تمت إضافة الموظف بنجاح. يمكنك الآن تحديد جدول دوامه.",
      );

      router.refresh();
    } catch {
      setErrorMessage(
        "حدث خطأ أثناء إضافة الموظف.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleStatusChange(
    employeeId: string,
    newStatus: boolean,
  ) {
    setActionEmployeeId(
      employeeId,
    );

    setErrorMessage("");
    setSuccessMessage("");

    try {
      const response =
        await fetch(
          `/api/admin/employees/${employeeId}/status`,
          {
            method:
              "PATCH",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                isActive:
                  newStatus,
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
            "تعذر تعديل حالة الموظف.",
        );

        return;
      }

      setSuccessMessage(
        newStatus
          ? "تم تفعيل الموظف."
          : "تم تعطيل الموظف.",
      );

      router.refresh();
    } catch {
      setErrorMessage(
        "حدث خطأ أثناء تعديل حالة الموظف.",
      );
    } finally {
      setActionEmployeeId(
        null,
      );
    }
  }

  async function handleResetPin(
    employeeId: string,
  ) {
    const newPin =
      window.prompt(
        "أدخل PIN جديد للموظف من 4 إلى 6 أرقام:",
      );

    if (
      newPin === null
    ) {
      return;
    }

    if (
      !/^\d{4,6}$/.test(
        newPin,
      )
    ) {
      setErrorMessage(
        "يجب أن يكون PIN من 4 إلى 6 أرقام.",
      );

      return;
    }

    setActionEmployeeId(
      employeeId,
    );

    setErrorMessage("");
    setSuccessMessage("");

    try {
      const response =
        await fetch(
          `/api/admin/employees/${employeeId}/pin`,
          {
            method:
              "PATCH",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                pin:
                  newPin,
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
            "تعذر تغيير PIN.",
        );

        return;
      }

      setSuccessMessage(
        "تم تغيير PIN بنجاح.",
      );

      router.refresh();
    } catch {
      setErrorMessage(
        "حدث خطأ أثناء تغيير PIN.",
      );
    } finally {
      setActionEmployeeId(
        null,
      );
    }
  }

  function handleScheduleChange(
    employeeId: string,
    day:
      EmployeeWeekday,
    option:
      ScheduleOption,
  ) {
    const current =
      getEmployeeScheduleDraft(
        employeeId,
      );

    setScheduleDrafts(
      (drafts) => ({
        ...drafts,

        [employeeId]: {
          ...current,

          [day]:
            optionToShifts(
              option,
            ),
        },
      }),
    );

    setErrorMessage("");
    setSuccessMessage("");
  }

  async function handleSaveSchedule(
    employeeId: string,
  ) {
    const schedule =
      getEmployeeScheduleDraft(
        employeeId,
      );

    setSavingScheduleEmployeeId(
      employeeId,
    );

    setErrorMessage("");
    setSuccessMessage("");

    try {
      const response =
        await fetch(
          `/api/admin/employees/${employeeId}/schedule`,
          {
            method:
              "PATCH",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify(
                schedule,
              ),
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
            "تعذر حفظ جدول الموظف.",
        );

        return;
      }

      setScheduleDrafts(
        (drafts) => ({
          ...drafts,

          [employeeId]:
            data.data.schedule,
        }),
      );

      setSuccessMessage(
        "تم حفظ جدول الموظف بنجاح.",
      );
    } catch {
      setErrorMessage(
        "حدث خطأ أثناء حفظ جدول الموظف.",
      );
    } finally {
      setSavingScheduleEmployeeId(
        null,
      );
    }
  }

  async function handleSaveShiftSettings(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setSavingSettings(
      true,
    );

    setErrorMessage("");
    setSuccessMessage("");

    try {
      const response =
        await fetch(
          "/api/admin/employees/shift-settings",
          {
            method:
              "PATCH",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                morningStart,
                morningEnd,
                eveningStart,
                eveningEnd,
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
            "تعذر حفظ أوقات الشفتات.",
        );

        return;
      }

      setSuccessMessage(
        "تم حفظ أوقات الشفتات بنجاح.",
      );
    } catch {
      setErrorMessage(
        "حدث خطأ أثناء حفظ أوقات الشفتات.",
      );
    } finally {
      setSavingSettings(
        false,
      );
    }
  }

  return (
    <main
      className={
        styles.page
      }
      dir="rtl"
    >
      <header
        className={
          styles.header
        }
      >
        <div>
          <p
            className={
              styles.eyebrow
            }
          >
            محطة الفنار
          </p>

          <h1>
            إدارة الموظفين
          </h1>

          <p
            className={
              styles.subtitle
            }
          >
            إدارة الموظفين،
            رموز PIN، الحالة
            وجدول الدوام من مكان
            واحد.
          </p>
        </div>
      </header>

      {errorMessage && (
        <div
          className={
            scheduleStyles.section
          }
        >
          <p
            className={
              styles.errorMessage
            }
          >
            {errorMessage}
          </p>
        </div>
      )}

      {successMessage && (
        <div
          className={
            scheduleStyles.section
          }
        >
          <p
            className={
              styles.successMessage
            }
          >
            {successMessage}
          </p>
        </div>
      )}

      <section
        className={
          styles.grid
        }
      >
        <div
          className={
            styles.card
          }
        >
          <div
            className={
              styles.cardHeader
            }
          >
            <h2>
              إضافة موظف جديد
            </h2>

            <p>
              يتم حفظ PIN بشكل
              مشفر ولا يتم عرضه
              بعد الحفظ.
            </p>
          </div>

          <form
            className={
              styles.form
            }
            onSubmit={
              handleSubmit
            }
          >
            <label>
              اسم الموظف

              <input
                type="text"
                value={name}
                onChange={(
                  event,
                ) =>
                  setName(
                    event.target
                      .value,
                  )
                }
                placeholder="مثال: أحمد محمد"
                minLength={2}
                maxLength={100}
                disabled={
                  loading
                }
                required
              />
            </label>

            <label>
              PIN الموظف

              <div
                className={
                  styles.pinField
                }
              >
                <input
                  type={
                    showPin
                      ? "text"
                      : "password"
                  }
                  inputMode="numeric"
                  value={pin}
                  onChange={(
                    event,
                  ) =>
                    setPin(
                      event.target
                        .value.replace(
                          /\D/g,
                          "",
                        ),
                    )
                  }
                  placeholder="4 إلى 6 أرقام"
                  pattern="[0-9]{4,6}"
                  minLength={4}
                  maxLength={6}
                  disabled={
                    loading
                  }
                  required
                />

                <button
                  type="button"
                  className={
                    styles.pinToggleButton
                  }
                  onClick={() =>
                    setShowPin(
                      (
                        current,
                      ) =>
                        !current,
                    )
                  }
                  disabled={
                    loading
                  }
                >
                  {showPin
                    ? "إخفاء"
                    : "إظهار"}
                </button>
              </div>
            </label>

            <button
              type="submit"
              disabled={
                loading
              }
              className={
                styles.primaryButton
              }
            >
              {loading
                ? "جاري الإضافة..."
                : "إضافة الموظف"}
            </button>
          </form>
        </div>

        <div
          className={
            styles.card
          }
        >
          <div
            className={
              styles.cardHeader
            }
          >
            <h2>
              الموظفون
            </h2>

            <p>
              عدد الموظفين:{" "}
              {
                employees.length
              }
            </p>
          </div>

          {employees.length ===
          0 ? (
            <div
              className={
                styles.emptyState
              }
            >
              <strong>
                لا يوجد موظفون بعد
              </strong>

              <span>
                أضف أول موظف من
                النموذج.
              </span>
            </div>
          ) : (
            <div
              className={
                styles.employeeList
              }
            >
              {employees.map(
                (employee) => (
                  <article
                    key={
                      employee.id
                    }
                    className={
                      styles.employeeRow
                    }
                  >
                    <div
                      className={
                        styles.employeeInfo
                      }
                    >
                      <div
                        className={
                          styles.avatar
                        }
                      >
                        {employee.name
                          .charAt(
                            0,
                          )
                          .toUpperCase()}
                      </div>

                      <div>
                        <strong>
                          {
                            employee.name
                          }
                        </strong>

                        <span>
                          تم الإنشاء{" "}
                          {new Intl.DateTimeFormat(
                            "ar-JO",
                            {
                              dateStyle:
                                "medium",
                            },
                          ).format(
                            new Date(
                              employee.createdAt,
                            ),
                          )}
                        </span>
                      </div>
                    </div>

                    <div
                      className={
                        styles.employeeActions
                      }
                    >
                      <span
                        className={
                          employee.isActive
                            ? styles.activeBadge
                            : styles.inactiveBadge
                        }
                      >
                        {employee.isActive
                          ? "فعّال"
                          : "معطّل"}
                      </span>

                      <button
                        type="button"
                        className={
                          styles.secondaryButton
                        }
                        disabled={
                          actionEmployeeId ===
                          employee.id
                        }
                        onClick={() =>
                          void handleResetPin(
                            employee.id,
                          )
                        }
                      >
                        تغيير PIN
                      </button>

                      <button
                        type="button"
                        className={
                          employee.isActive
                            ? styles.dangerButton
                            : styles.enableButton
                        }
                        disabled={
                          actionEmployeeId ===
                          employee.id
                        }
                        onClick={() =>
                          void handleStatusChange(
                            employee.id,
                            !employee.isActive,
                          )
                        }
                      >
                        {employee.isActive
                          ? "تعطيل"
                          : "تفعيل"}
                      </button>
                    </div>
                  </article>
                ),
              )}
            </div>
          )}
        </div>
      </section>

      <section
        className={
          scheduleStyles.section
        }
      >
        <div
          className={
            scheduleStyles.card
          }
        >
          <div
            className={
              scheduleStyles.cardHeader
            }
          >
            <div>
              <h2>
                أوقات الشفتات
              </h2>

              <p>
                هذه الأوقات
                يستخدمها النظام
                فعليًا لتحديد من
                يستطيع الدخول.
              </p>
            </div>
          </div>

          <form
            className={
              scheduleStyles.settingsForm
            }
            onSubmit={
              handleSaveShiftSettings
            }
          >
            <div
              className={
                scheduleStyles.shiftSettingsGrid
              }
            >
              <div
                className={
                  scheduleStyles.shiftGroup
                }
              >
                <div
                  className={
                    scheduleStyles.shiftGroupTitle
                  }
                >
                  <span
                    className={
                      scheduleStyles.shiftDot
                    }
                  />

                  <strong>
                    الشفت الصباحي
                  </strong>
                </div>

                <div
                  className={
                    scheduleStyles.timeGrid
                  }
                >
                  <label
                    className={
                      scheduleStyles.timeField
                    }
                  >
                    البداية

                    <input
                      type="time"
                      value={
                        morningStart
                      }
                      onChange={(
                        event,
                      ) =>
                        setMorningStart(
                          event.target
                            .value,
                        )
                      }
                      required
                    />
                  </label>

                  <label
                    className={
                      scheduleStyles.timeField
                    }
                  >
                    النهاية

                    <input
                      type="time"
                      value={
                        morningEnd
                      }
                      onChange={(
                        event,
                      ) =>
                        setMorningEnd(
                          event.target
                            .value,
                        )
                      }
                      required
                    />
                  </label>
                </div>
              </div>

              <div
                className={
                  scheduleStyles.shiftGroup
                }
              >
                <div
                  className={
                    scheduleStyles.shiftGroupTitle
                  }
                >
                  <span
                    className={
                      scheduleStyles.shiftDot
                    }
                  />

                  <strong>
                    الشفت المسائي
                  </strong>
                </div>

                <div
                  className={
                    scheduleStyles.timeGrid
                  }
                >
                  <label
                    className={
                      scheduleStyles.timeField
                    }
                  >
                    البداية

                    <input
                      type="time"
                      value={
                        eveningStart
                      }
                      onChange={(
                        event,
                      ) =>
                        setEveningStart(
                          event.target
                            .value,
                        )
                      }
                      required
                    />
                  </label>

                  <label
                    className={
                      scheduleStyles.timeField
                    }
                  >
                    النهاية

                    <input
                      type="time"
                      value={
                        eveningEnd
                      }
                      onChange={(
                        event,
                      ) =>
                        setEveningEnd(
                          event.target
                            .value,
                        )
                      }
                      required
                    />
                  </label>
                </div>
              </div>
            </div>

            <div
              className={
                scheduleStyles.settingsFooter
              }
            >
              <span
                className={
                  scheduleStyles.settingsHint
                }
              >
                الأوقات محفوظة في
                Firestore ويمكن
                تعديلها من هنا في
                أي وقت.
              </span>

              <button
                type="submit"
                className={
                  scheduleStyles.saveButton
                }
                disabled={
                  savingSettings
                }
              >
                {savingSettings
                  ? "جاري الحفظ..."
                  : "حفظ أوقات الشفتات"}
              </button>
            </div>
          </form>
        </div>
      </section>

      <section
        className={
          scheduleStyles.section
        }
      >
        <div
          className={
            scheduleStyles.card
          }
        >
          <div
            className={
              scheduleStyles.cardHeader
            }
          >
            <div>
              <h2>
                جدول الموظفين
              </h2>

              <p>
                حدد دوام كل موظف
                لكل يوم من أيام
                الأسبوع.
              </p>
            </div>

            <div
              className={
                scheduleStyles.scheduleIntro
              }
            >
              <span
                className={
                  scheduleStyles.legendBadge
                }
              >
                راحة
              </span>

              <span
                className={
                  scheduleStyles.legendBadge
                }
              >
                صباحي
              </span>

              <span
                className={
                  scheduleStyles.legendBadge
                }
              >
                مسائي
              </span>
            </div>
          </div>

          {employees.length ===
          0 ? (
            <div
              className={
                scheduleStyles.emptySchedule
              }
            >
              أضف موظفًا أولًا
              حتى تتمكن من تحديد
              جدوله.
            </div>
          ) : (
            <div
              className={
                scheduleStyles.tableWrapper
              }
            >
              <table
                className={
                  scheduleStyles.scheduleTable
                }
              >
                <thead>
                  <tr>
                    <th>
                      الموظف
                    </th>

                    {scheduleDays.map(
                      (day) => (
                        <th
                          key={
                            day.key
                          }
                        >
                          {
                            day.label
                          }
                        </th>
                      ),
                    )}

                    <th>
                      حفظ
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {employees.map(
                    (employee) => {
                      const schedule =
                        getEmployeeScheduleDraft(
                          employee.id,
                        );

                      return (
                        <tr
                          key={
                            employee.id
                          }
                        >
                          <td
                            className={
                              scheduleStyles.employeeCell
                            }
                          >
                            <span
                              className={
                                scheduleStyles.employeeName
                              }
                            >
                              {
                                employee.name
                              }
                            </span>

                            <span
                              className={
                                scheduleStyles.employeeStatus
                              }
                            >
                              {employee.isActive
                                ? "موظف فعّال"
                                : "موظف معطّل"}
                            </span>
                          </td>

                          {scheduleDays.map(
                            (
                              day,
                            ) => (
                              <td
                                key={
                                  day.key
                                }
                              >
                                <select
                                  className={
                                    scheduleStyles.daySelect
                                  }
                                  value={shiftsToOption(
                                    schedule[
                                      day
                                        .key
                                    ],
                                  )}
                                  onChange={(
                                    event,
                                  ) =>
                                    handleScheduleChange(
                                      employee.id,
                                      day.key,
                                      event.target
                                        .value as ScheduleOption,
                                    )
                                  }
                                >
                                  <option value="REST">
                                    راحة
                                  </option>

                                  <option value="MORNING">
                                    صباحي
                                  </option>

                                  <option value="EVENING">
                                    مسائي
                                  </option>

                                  <option value="BOTH">
                                    صباحي + مسائي
                                  </option>
                                </select>
                              </td>
                            ),
                          )}

                          <td>
                            <button
                              type="button"
                              className={
                                scheduleStyles.rowSaveButton
                              }
                              disabled={
                                savingScheduleEmployeeId ===
                                employee.id
                              }
                              onClick={() =>
                                void handleSaveSchedule(
                                  employee.id,
                                )
                              }
                            >
                              {savingScheduleEmployeeId ===
                              employee.id
                                ? "..."
                                : "حفظ"}
                            </button>
                          </td>
                        </tr>
                      );
                    },
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}