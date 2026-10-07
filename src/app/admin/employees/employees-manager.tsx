"use client";

import {
  FormEvent,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import styles from "./employees.module.css";

type EmployeeView = {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
};

type EmployeesManagerProps = {
  employees: EmployeeView[];
};

export function EmployeesManager({
  employees,
}: EmployeesManagerProps) {
  const router = useRouter();

  const [name, setName] = useState("");
  const [pin, setPin] = useState("");

  const [loading, setLoading] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState("");

  const [successMessage, setSuccessMessage] =
    useState("");

  const [showPin, setShowPin] = useState(false); 
  
  const [actionEmployeeId, setActionEmployeeId] =
  useState<string | null>(null);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setLoading(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const response = await fetch(
        "/api/admin/employees",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            name,
            pin,
          }),
        },
      );

      const data = await response.json();

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
        "تمت إضافة الموظف بنجاح.",
      );

      router.refresh();
    } catch {
      setErrorMessage(
        "حدث خطأ غير متوقع أثناء إضافة الموظف.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleStatusChange(
  employeeId: string,
  newStatus: boolean,
) {
  setActionEmployeeId(employeeId);
  setErrorMessage("");
  setSuccessMessage("");

  try {
    const response = await fetch(
      `/api/admin/employees/${employeeId}/status`,
      {
        method: "PATCH",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          isActive: newStatus,
        }),
      },
    );

    const data = await response.json();

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
    setActionEmployeeId(null);
  }
}

async function handleResetPin(
  employeeId: string,
) {
  const newPin = window.prompt(
    "أدخل PIN جديد للموظف من 4 إلى 6 أرقام:",
  );

  if (newPin === null) {
    return;
  }

  if (!/^\d{4,6}$/.test(newPin)) {
    setErrorMessage(
      "يجب أن يكون PIN من 4 إلى 6 أرقام.",
    );
    return;
  }

  setActionEmployeeId(employeeId);
  setErrorMessage("");
  setSuccessMessage("");

  try {
    const response = await fetch(
      `/api/admin/employees/${employeeId}/pin`,
      {
        method: "PATCH",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          pin: newPin,
        }),
      },
    );

    const data = await response.json();

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
    setActionEmployeeId(null);
  }
}
  
  
  return (
    <main
      className={styles.page}
      dir="rtl"
    >
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>
            محطة الفنار
          </p>

          <h1>إدارة الموظفين</h1>

          <p className={styles.subtitle}>
            أضف الموظفين وأدر حساباتهم
            التشغيلية من مكان واحد.
          </p>
        </div>
      </header>

      <section className={styles.grid}>
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h2>إضافة موظف جديد</h2>

            <p>
              سيتم حفظ الـPIN بشكل مشفر
              ولن يتم عرضه بعد الحفظ.
            </p>
          </div>

          <form
            className={styles.form}
            onSubmit={handleSubmit}
          >
            <label>
              اسم الموظف

              <input
                type="text"
                value={name}
                onChange={(event) =>
                  setName(
                    event.target.value,
                  )
                }
                placeholder="مثال: سلطان محمود"
                minLength={2}
                maxLength={100}
                disabled={loading}
                required
              />
            </label>

           <label>
  PIN الموظف

  <div className={styles.pinField}>
    <input
      type={showPin ? "text" : "password"}
      inputMode="numeric"
      value={pin}
      onChange={(event) =>
        setPin(event.target.value)
      }
      placeholder="4 إلى 6 أرقام"
      pattern="[0-9]{4,6}"
      minLength={4}
      maxLength={6}
      disabled={loading}
      required
    />

    <button
      type="button"
      className={styles.pinToggleButton}
      onClick={() =>
        setShowPin((current) => !current)
      }
      disabled={loading}
    >
      {showPin ? "إخفاء" : "إظهار"}
    </button>
  </div>
</label>

            {errorMessage && (
              <p
                className={
                  styles.errorMessage
                }
              >
                {errorMessage}
              </p>
            )}

            {successMessage && (
              <p
                className={
                  styles.successMessage
                }
              >
                {successMessage}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
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

        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h2>الموظفون</h2>

            <p>
              عدد الموظفين:{" "}
              {employees.length}
            </p>
          </div>

          {employees.length === 0 ? (
            <div
              className={styles.emptyState}
            >
              <strong>
                لا يوجد موظفون بعد
              </strong>

              <span>
                أضف أول موظف من النموذج.
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
                    key={employee.id}
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
                          .charAt(0)
                          .toUpperCase()}
                      </div>

                      <div>
                        <strong>
                          {employee.name}
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

                   <div className={styles.employeeActions}>
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
    className={styles.secondaryButton}
    disabled={
      actionEmployeeId === employee.id
    }
    onClick={() =>
      handleResetPin(employee.id)
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
      actionEmployeeId === employee.id
    }
    onClick={() =>
      handleStatusChange(
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
    </main>
  );
}