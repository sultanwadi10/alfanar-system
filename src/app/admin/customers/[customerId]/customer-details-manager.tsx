"use client";
import { limitJordanPhoneInput,normalizeJordanPhone } from "@/lib/customers/customer-phone";
import { CustomerPrivateBottles } from "@/components/admin/customer-private-bottles";
import { userMessage } from "@/lib/client/user-message";
import { useTransientMessage } from "@/lib/client/use-transient-message";
import { useConfirmation } from "@/lib/client/use-confirmation";

import {
  type FormEvent,
  useState,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { dinars,parseDinars } from "@/lib/format/money-input";
import styles from "./customer-details.module.css";

import { CustomerBookletWallet, type CustomerWalletData } from "./customer-booklet-wallet";

type CustomerDetailsData = {
  specialDelivery20LPriceFils?: number | null;
  id: string;

  name: string;

  phone: string;

  primaryAddress: string;

  adminNotes: string;

  couponBalance: number;
  deliveryOrdersCount: number;

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

  walletData: CustomerWalletData;
};

export function CustomerDetailsManager({
  customer,
  walletData,
}: CustomerDetailsManagerProps) {
  const { confirm, confirmationDialog } = useConfirmation();
  const router = useRouter();

  const [specialEnabled,setSpecialEnabled]=useState(customer.specialDelivery20LPriceFils!=null);
  const [specialPrice,setSpecialPrice]=useState(customer.specialDelivery20LPriceFils!=null?(customer.specialDelivery20LPriceFils/1000).toFixed(3):"");
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
  useTransientMessage(successMessage, setSuccessMessage);

  function cancelEditing() {
    setSpecialEnabled(customer.specialDelivery20LPriceFils!=null);
    setSpecialPrice(customer.specialDelivery20LPriceFils!=null?(customer.specialDelivery20LPriceFils/1000).toFixed(3):"");
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
    if(!normalizeJordanPhone(phone)){setErrorMessage(userMessage("أدخل رقم هاتف أردني صحيحًا ومكتملًا."));return;}
    const special=specialEnabled?parseDinars(specialPrice):null;
    if(specialEnabled&&(special===null||special>10_000_000)){setErrorMessage(userMessage("أدخل سعرًا صحيحًا بالدينار، حتى ثلاث منازل عشرية."));return;}

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
            specialDelivery20LPriceFils: special,
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
            "تعذر تعديل بيانات العميل."),
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
        userMessage("تعذّر الاتصال. حاول مجددًا."),
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleArchive() {
    const confirmed =
      await confirm({"title":"أرشفة العميل؟","confirmLabel":"أرشفة","tone":"warning"});

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
          userMessage(data?.error?.message ??
            "تعذر أرشفة العميل."),
        );

        return;
      }

      router.replace(
        "/admin/customers",
      );

      router.refresh();
    } catch {
      setErrorMessage(
        userMessage("حدث خطأ أثناء أرشفة العميل."),
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
      <CustomerBookletWallet
        customerId={customer.id}
        customerName={customer.name}
        isArchived={customer.isArchived}
        data={walletData}
      />
      <div className={styles.contentGrid}>
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
                  type="tel" onPaste={event=>{event.preventDefault();setPhone(limitJordanPhoneInput(event.clipboardData.getData("text")));}}
                  maxLength={14}
                  value={phone}
                  onChange={(event) =>
                    setPhone(limitJordanPhoneInput(event.target.value))
                  }
                  inputMode="tel"
                  disabled={
                    loading ||
                    customer.appLinked
                  }
                  required
                />

                {customer.appLinked && (
                  null
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

              <div className={styles.specialPriceSettings}><label className={styles.specialPriceToggle}><input type="checkbox" checked={specialEnabled} onChange={event=>setSpecialEnabled(event.target.checked)} disabled={loading}/>سعر خاص لتعبئة 20 لتر بالتوصيل</label>{specialEnabled&&<label>سعر القارورة — بالدينار<input inputMode="decimal" lang="en-GB" dir="ltr" value={specialPrice} onChange={event=>setSpecialPrice(event.target.value)} placeholder="0.750" required disabled={loading}/></label>}</div>
              <CustomerPrivateBottles customerId={customer.id} disabled={loading||customer.isArchived}/>
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

              <div className={styles.detailRow}><span>سعر تعبئة 20 لتر بالتوصيل</span><strong>{customer.specialDelivery20LPriceFils!=null?<><bdi>{dinars(customer.specialDelivery20LPriceFils)}</bdi> د.أ</>:"السعر الافتراضي"}</strong></div>
              <CustomerPrivateBottles customerId={customer.id} disabled={customer.isArchived}/>
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
    {confirmationDialog}
    </div>
  );
}