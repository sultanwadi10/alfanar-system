"use client";

import {
  type FormEvent,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import styles from "./customers.module.css";

export type CustomerListItem = {
  id: string;
  name: string;
  phone: string;
  couponBalance: number;
  lastOrderLabel: string | null;
  appLinked: boolean;
  hasSpecialPrice: boolean;
};

type CustomersManagerProps = {
  customers: CustomerListItem[];
};

export function CustomersManager({
  customers,
}: CustomersManagerProps) {
  const router = useRouter();

  const [searchQuery, setSearchQuery] =
    useState("");

  const [
    addCustomerOpen,
    setAddCustomerOpen,
  ] = useState(false);

  const [name, setName] =
    useState("");

  const [phone, setPhone] =
    useState("");

  const [
    primaryAddress,
    setPrimaryAddress,
  ] = useState("");

  const [
    adminNotes,
    setAdminNotes,
  ] = useState("");

  const [loading, setLoading] =
    useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  const [
    successMessage,
    setSuccessMessage,
  ] = useState("");

  const filteredCustomers =
    useMemo(() => {
      const query =
        searchQuery
          .trim()
          .toLowerCase();

      if (!query) {
        return customers;
      }

      return customers.filter(
        (customer) =>
          customer.name
            .toLowerCase()
            .includes(query) ||
          customer.phone.includes(
            query,
          ),
      );
    }, [
      customers,
      searchQuery,
    ]);

  const totalCustomers =
    customers.length;

  const customersToday = 0;

  const totalCoupons =
    customers.reduce(
      (total, customer) =>
        total +
        customer.couponBalance,
      0,
    );

  function resetForm() {
    setName("");
    setPhone("");
    setPrimaryAddress("");
    setAdminNotes("");
    setErrorMessage("");
  }

  function closeAddCustomer() {
    if (loading) {
      return;
    }

    setAddCustomerOpen(false);
    resetForm();
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setLoading(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const response = await fetch(
        "/api/admin/customers",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            name,
            phone,
            primaryAddress,
            adminNotes,
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
            "تعذر إنشاء العميل.",
        );

        return;
      }

      setSuccessMessage(
        `تمت إضافة العميل ${name.trim()} بنجاح.`,
      );

      setAddCustomerOpen(false);

      resetForm();

      router.refresh();
    } catch {
      setErrorMessage(
        "حدث خطأ أثناء الاتصال بالخدمة.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className={styles.page}
      dir="rtl"
    >
      <header
        className={styles.pageHeader}
      >
        <div>
          <p
            className={styles.eyebrow}
          >
            العملاء
          </p>

          <h1>
            إدارة العملاء
          </h1>

          <p
            className={styles.subtitle}
          >
            إدارة بيانات العملاء،
            الطلبات، محفظة الكوبونات
            وربط الحساب بالتطبيق.
          </p>
        </div>

        <button
          type="button"
          className={
            styles.addCustomerButton
          }
          onClick={() => {
            setErrorMessage("");
            setSuccessMessage("");
            setAddCustomerOpen(true);
          }}
        >
          + إضافة عميل
        </button>
      </header>

      {successMessage && (
        <div
          className={
            styles.previewMessage
          }
          role="status"
        >
          {successMessage}
        </div>
      )}

      <section
        className={styles.statsGrid}
      >
        <article
          className={styles.statCard}
        >
          <div
            className={
              styles.statHeader
            }
          >
            <span>
              إجمالي العملاء
            </span>

            <span
              className={
                styles.statIcon
              }
            >
              ع
            </span>
          </div>

          <strong>
            {totalCustomers}
          </strong>

          <small>
            جميع ملفات العملاء المسجلة
            في النظام.
          </small>
        </article>

        <article
          className={styles.statCard}
        >
          <div
            className={
              styles.statHeader
            }
          >
            <span>
              تم التعامل معهم اليوم
            </span>

            <span
              className={
                styles.statIcon
              }
            >
              ي
            </span>
          </div>

          <strong>
            {customersToday}
          </strong>

          <small>
            سيتم احتسابه تلقائيًا عند
            ربط نظام الطلبات.
          </small>
        </article>

        <article
          className={styles.statCard}
        >
          <div
            className={
              styles.statHeader
            }
          >
            <span>
              إجمالي رصيد الكوبونات
            </span>

            <span
              className={
                styles.statIcon
              }
            >
              ك
            </span>
          </div>

          <strong>
            {totalCoupons}
            {" "}
            كوبون
          </strong>

          <small>
            مجموع الكوبونات الموجودة في
            محافظ جميع العملاء.
          </small>
        </article>
      </section>

      <section
        className={styles.customersCard}
      >
        <div
          className={
            styles.customersHeader
          }
        >
          <div>
            <h2>
              قائمة العملاء
            </h2>

            <p>
              ابحث برقم الهاتف أو باسم
              العميل.
            </p>
          </div>

          <div
            className={
              styles.searchWrapper
            }
          >
            <input
              type="search"
              value={searchQuery}
              onChange={(event) =>
                setSearchQuery(
                  event.target.value,
                )
              }
              placeholder="ابحث بالهاتف أو الاسم..."
              aria-label="البحث عن عميل"
            />
          </div>
        </div>

        <div
          className={
            styles.tableWrapper
          }
        >
          <table
            className={
              styles.customersTable
            }
          >
            <thead>
              <tr>
                <th>العميل</th>
                <th>رقم الهاتف</th>
                <th>الكوبونات</th>
                <th>آخر طلب</th>
                <th>التطبيق</th>
                <th>سعر خاص</th>
                <th>التفاصيل</th>
              </tr>
            </thead>

            <tbody>
              {filteredCustomers.map(
                (customer) => (
                  <tr
                    key={customer.id}
                  >
                    <td>
                      <div
                        className={
                          styles.customerIdentity
                        }
                      >
                        <span
                          className={
                            styles.avatar
                          }
                        >
                          {customer.name
                            .trim()
                            .charAt(0)}
                        </span>

                        <strong>
                          {
                            customer.name
                          }
                        </strong>
                      </div>
                    </td>

                    <td
                      className={
                        styles.phoneCell
                      }
                    >
                      {customer.phone}
                    </td>

                    <td>
                      <span
                        className={
                          styles.couponBadge
                        }
                      >
                        {
                          customer.couponBalance
                        }
                        {" "}
                        / 22
                      </span>
                    </td>

                    <td>
                      {customer.lastOrderLabel ??
                        "لا يوجد"}
                    </td>

                    <td>
                      <span
                        className={
                          customer.appLinked
                            ? styles.linkedBadge
                            : styles.notLinkedBadge
                        }
                      >
                        {customer.appLinked
                          ? "مرتبط"
                          : "غير مرتبط"}
                      </span>
                    </td>

                    <td>
                      {customer.hasSpecialPrice
                        ? "نعم"
                        : "لا"}
                    </td>

                    <td>
                      <button
                        type="button"
                        className={
                          styles.detailsButton
                        }
                      >
                        تفاصيل
                      </button>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>

          {filteredCustomers.length ===
            0 && (
            <div
              className={
                styles.emptyState
              }
            >
              <div
                className={
                  styles.emptyIcon
                }
              >
                ع
              </div>

              <strong>
                {searchQuery
                  ? "لم يتم العثور على عميل"
                  : "لا يوجد عملاء حتى الآن"}
              </strong>

              <p>
                {searchQuery
                  ? "جرّب البحث برقم هاتف أو اسم مختلف."
                  : "عند إضافة أول عميل سيظهر هنا مع بياناته ومحفظة الكوبونات."}
              </p>

              {!searchQuery && (
                <button
                  type="button"
                  className={
                    styles.emptyAddButton
                  }
                  onClick={() => {
                    setErrorMessage("");
                    setSuccessMessage("");
                    setAddCustomerOpen(
                      true,
                    );
                  }}
                >
                  إضافة أول عميل
                </button>
              )}
            </div>
          )}
        </div>
      </section>

      {addCustomerOpen && (
        <div
          className={
            styles.modalBackdrop
          }
          role="presentation"
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              closeAddCustomer();
            }
          }}
        >
          <section
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-customer-title"
          >
            <div
              className={
                styles.modalHeader
              }
            >
              <div>
                <p
                  className={
                    styles.modalEyebrow
                  }
                >
                  عميل جديد
                </p>

                <h2
                  id="add-customer-title"
                >
                  إضافة ملف عميل
                </h2>

                <p>
                  رقم الهاتف سيكون وسيلة
                  التعرف الأساسية على العميل
                  وربط حساب التطبيق مستقبلًا.
                </p>
              </div>

              <button
                type="button"
                className={
                  styles.closeButton
                }
                aria-label="إغلاق"
                onClick={
                  closeAddCustomer
                }
                disabled={loading}
              >
                ×
              </button>
            </div>

            <form
              className={
                styles.customerForm
              }
              onSubmit={
                handleSubmit
              }
            >
              <label>
                اسم العميل

                <input
                  type="text"
                  value={name}
                  onChange={(event) =>
                    setName(
                      event.target.value,
                    )
                  }
                  placeholder="مثال: أحمد محمد"
                  autoComplete="name"
                  disabled={loading}
                  required
                />
              </label>

              <label>
                رقم الهاتف

                <input
                  type="tel"
                  value={phone}
                  onChange={(event) =>
                    setPhone(
                      event.target.value,
                    )
                  }
                  placeholder="07XXXXXXXX"
                  autoComplete="tel"
                  inputMode="tel"
                  disabled={loading}
                  required
                />

                <small>
                  سيتم توحيد الرقم
                  تلقائيًا ومنع تسجيل نفس
                  العميل مرتين.
                </small>
              </label>

              <label>
                العنوان

                <input
                  type="text"
                  value={
                    primaryAddress
                  }
                  onChange={(event) =>
                    setPrimaryAddress(
                      event.target.value,
                    )
                  }
                  placeholder="مثال: عمّان - طبربور"
                  autoComplete="street-address"
                  disabled={loading}
                />
              </label>

              <label>
                ملاحظات داخلية

                <textarea
                  value={adminNotes}
                  onChange={(event) =>
                    setAdminNotes(
                      event.target.value,
                    )
                  }
                  rows={4}
                  placeholder="ملاحظات خاصة بالإدارة..."
                  disabled={loading}
                />

                <small>
                  هذه الملاحظات إدارية ولن
                  تظهر للعميل داخل التطبيق.
                </small>
              </label>

              <div
                className={
                  styles.formInfo
                }
              >
                <strong>
                  محفظة الكوبونات
                </strong>

                <span>
                  يبدأ العميل برصيد صفر.
                  إضافة الرصيد ستكون عملية
                  مستقلة ومسجلة باسم
                  المسؤول.
                </span>
              </div>

              {errorMessage && (
                <div
                  className={
                    styles.previewMessage
                  }
                  role="alert"
                >
                  {errorMessage}
                </div>
              )}

              <div
                className={
                  styles.formActions
                }
              >
                <button
                  type="button"
                  className={
                    styles.cancelButton
                  }
                  onClick={
                    closeAddCustomer
                  }
                  disabled={loading}
                >
                  إلغاء
                </button>

                <button
                  type="submit"
                  className={
                    styles.saveButton
                  }
                  disabled={loading}
                >
                  {loading
                    ? "جاري الحفظ..."
                    : "حفظ العميل"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}