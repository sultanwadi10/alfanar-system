"use client";

import {
  type FormEvent,
  useState,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import styles from "./customer-details.module.css";

import {
  CustomerCouponWallet,
  type CouponTransactionItem,
} from "./customer-coupon-wallet";

type CustomerDetailsData = {
  id: string;

  name: string;

  phone: string;

  primaryAddress: string;

  adminNotes: string;

  couponBalance: number;

  appLinked: boolean;

  isArchived: boolean;

  creatorLabel: string;

  createdAtLabel: string;

  archivedAtLabel:
    | string
    | null;
};

type CustomerDetailsManagerProps = {
  customer: CustomerDetailsData;

  couponTransactions:
    CouponTransactionItem[];
};

export function CustomerDetailsManager({
  customer,
  couponTransactions,
}: CustomerDetailsManagerProps) {
  const router = useRouter();

  const [editing, setEditing] =
    useState(false);

  const [name, setName] =
    useState(customer.name);

  const [phone, setPhone] =
    useState(customer.phone);

  const [
    primaryAddress,
    setPrimaryAddress,
  ] = useState(
    customer.primaryAddress,
  );

  const [
    adminNotes,
    setAdminNotes,
  ] = useState(
    customer.adminNotes,
  );

  const [loading, setLoading] =
    useState(false);

  const [
    archiving,
    setArchiving,
  ] = useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  const [
    successMessage,
    setSuccessMessage,
  ] = useState("");

  function cancelEditing() {
    setName(customer.name);

    setPhone(customer.phone);

    setPrimaryAddress(
      customer.primaryAddress,
    );

    setAdminNotes(
      customer.adminNotes,
    );

    setErrorMessage("");

    setEditing(false);
  }

  async function handleUpdate(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setLoading(true);

    setErrorMessage("");

    setSuccessMessage("");

    try {
      const response = await fetch(
        `/api/admin/customers/${customer.id}`,
        {
          method: "PATCH",

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
            "تعذر تعديل بيانات العميل.",
        );

        return;
      }

      setSuccessMessage(
        "تم تحديث بيانات العميل بنجاح.",
      );

      setEditing(false);

      router.refresh();
    } catch {
      setErrorMessage(
        "حدث خطأ أثناء الاتصال بالخدمة.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleArchive() {
    const confirmed =
      window.confirm(
        "هل أنت متأكد من أرشفة هذا العميل؟ لن يتم حذف سجله أو رقم هاتفه من النظام.",
      );

    if (!confirmed) {
      return;
    }

    setArchiving(true);

    setErrorMessage("");

    setSuccessMessage("");

    try {
      const response = await fetch(
        `/api/admin/customers/${customer.id}/archive`,
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
            "تعذر أرشفة العميل.",
        );

        return;
      }

      router.replace(
        "/admin/customers",
      );

      router.refresh();
    } catch {
      setErrorMessage(
        "حدث خطأ أثناء أرشفة العميل.",
      );
    } finally {
      setArchiving(false);
    }
  }

  return (
    <div
      className={styles.page}
      dir="rtl"
    >
      <div
        className={styles.topBar}
      >
        <Link
          href="/admin/customers"
          className={styles.backLink}
        >
          ← العودة للعملاء
        </Link>

        <span>
          ملف العميل
        </span>
      </div>

      <section
        className={
          styles.profileHeader
        }
      >
        <div
          className={
            styles.identity
          }
        >
          <div
            className={styles.avatar}
          >
            {customer.name
              .trim()
              .charAt(0)}
          </div>

          <div>
            <p
              className={
                styles.eyebrow
              }
            >
              العميل
            </p>

            <h1>
              {customer.name}
            </h1>

            <div
              className={
                styles.profileMeta
              }
            >
              <span>
                {customer.phone}
              </span>

              <span>•</span>

              <span>
                أُنشئ في{" "}
                {
                  customer.createdAtLabel
                }
              </span>

              {customer.isArchived &&
                customer.archivedAtLabel && (
                  <>
                    <span>•</span>

                    <span>
                      أُرشف في{" "}
                      {
                        customer.archivedAtLabel
                      }
                    </span>
                  </>
                )}
            </div>
          </div>
        </div>

        <div
          className={
            styles.profileBadges
          }
        >
          <span
            className={
              customer.appLinked
                ? styles.linkedBadge
                : styles.notLinkedBadge
            }
          >
            {customer.appLinked
              ? "التطبيق مرتبط"
              : "التطبيق غير مرتبط"}
          </span>

          <span
            className={
              styles.sourceBadge
            }
          >
            تم إنشاء الملف بواسطة:{" "}
            {customer.creatorLabel}
          </span>

          {customer.isArchived && (
            <span
              className={
                styles.notLinkedBadge
              }
            >
              العميل مؤرشف
            </span>
          )}
        </div>
      </section>

      {successMessage && (
        <div
          className={
            styles.successMessage
          }
          role="status"
        >
          {successMessage}
        </div>
      )}

      {errorMessage && (
        <div
          className={
            styles.errorMessage
          }
          role="alert"
        >
          {errorMessage}
        </div>
      )}

      <section
        className={styles.statsGrid}
      >
        <article
          className={styles.statCard}
        >
          <span>
            رصيد الكوبونات
          </span>

          <strong>
            {customer.couponBalance}
            {" "}
            / 22
          </strong>

          <small>
            الرصيد الحالي داخل
            محفظة العميل.
          </small>
        </article>

        <article
          className={styles.statCard}
        >
          <span>
            إجمالي الطلبات
          </span>

          <strong>
            0
          </strong>

          <small>
            سيتم ربطه بنظام الطلبات.
          </small>
        </article>

        <article
          className={styles.statCard}
        >
          <span>
            السعر الخاص
          </span>

          <strong>
            لا يوجد
          </strong>

          <small>
            سيتم ربطه بنظام الأسعار.
          </small>
        </article>
      </section>

      <div
        className={styles.contentGrid}
      >
        <section
          className={
            styles.detailsCard
          }
        >
          <div
            className={
              styles.cardHeader
            }
          >
            <div>
              <h2>
                بيانات العميل
              </h2>

              <p>
                المعلومات الأساسية
                المحفوظة داخل النظام.
              </p>
            </div>

            {!editing &&
              !customer.isArchived && (
                <button
                  type="button"
                  className={
                    styles.editButton
                  }
                  onClick={() => {
                    setErrorMessage("");
                    setSuccessMessage("");
                    setEditing(true);
                  }}
                >
                  تعديل البيانات
                </button>
              )}
          </div>

          {editing ? (
            <form
              className={
                styles.editForm
              }
              onSubmit={
                handleUpdate
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
                  inputMode="tel"
                  disabled={
                    loading ||
                    customer.appLinked
                  }
                  required
                />

                {customer.appLinked && (
                  <small>
                    رقم الهاتف مقفل لأن
                    العميل مرتبط بالتطبيق.
                    تغيير الرقم سيحتاج
                    آلية تحقق منفصلة لاحقًا.
                  </small>
                )}
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
                  disabled={loading}
                />
              </label>

              <label>
                ملاحظات داخلية

                <textarea
                  rows={5}
                  value={adminNotes}
                  onChange={(event) =>
                    setAdminNotes(
                      event.target.value,
                    )
                  }
                  disabled={loading}
                />

                <small>
                  لا تظهر هذه الملاحظات
                  للعميل داخل التطبيق.
                </small>
              </label>

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
                    cancelEditing
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
                    : "حفظ التعديلات"}
                </button>
              </div>
            </form>
          ) : (
            <div
              className={
                styles.detailsList
              }
            >
              <div
                className={
                  styles.detailRow
                }
              >
                <span>
                  الاسم
                </span>

                <strong>
                  {customer.name}
                </strong>
              </div>

              <div
                className={
                  styles.detailRow
                }
              >
                <span>
                  رقم الهاتف
                </span>

                <strong
                  className={
                    styles.phone
                  }
                >
                  {customer.phone}
                </strong>
              </div>

              <div
                className={
                  styles.detailRow
                }
              >
                <span>
                  العنوان
                </span>

                <strong>
                  {customer.primaryAddress ||
                    "غير مسجل"}
                </strong>
              </div>

              <div
                className={
                  styles.detailRow
                }
              >
                <span>
                  تم إنشاء الملف بواسطة
                </span>

                <strong>
                  {
                    customer.creatorLabel
                  }
                </strong>
              </div>

              <div
                className={
                  styles.notesRow
                }
              >
                <span>
                  ملاحظات داخلية
                </span>

                <p>
                  {customer.adminNotes ||
                    "لا توجد ملاحظات."}
                </p>
              </div>
            </div>
          )}
        </section>

        <div
          className={
            styles.sideColumn
          }
        >
          <CustomerCouponWallet
            customerId={
              customer.id
            }
            couponBalance={
              customer.couponBalance
            }
            isArchived={
              customer.isArchived
            }
            transactions={
              couponTransactions
            }
          />

          {!customer.isArchived ? (
            <section
              className={
                styles.dangerCard
              }
            >
              <div>
                <h2>
                  أرشفة العميل
                </h2>

                <p>
                  الأرشفة تخفي العميل من
                  القوائم التشغيلية، لكن
                  تحتفظ بملفه ورقم هاتفه
                  وسجله داخل النظام.
                </p>
              </div>

              <button
                type="button"
                className={
                  styles.archiveButton
                }
                onClick={
                  handleArchive
                }
                disabled={
                  archiving
                }
              >
                {archiving
                  ? "جاري الأرشفة..."
                  : "أرشفة العميل"}
              </button>
            </section>
          ) : (
            <section
              className={
                styles.dangerCard
              }
            >
              <div>
                <h2>
                  العميل مؤرشف
                </h2>

                <p>
                  هذا العميل موجود في
                  الأرشيف. يمكن استعادته
                  من تبويب الأرشيف في
                  صفحة إدارة العملاء.
                </p>
              </div>

              <Link
                href="/admin/customers"
                className={
                  styles.backLink
                }
              >
                العودة لإدارة العملاء
              </Link>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}