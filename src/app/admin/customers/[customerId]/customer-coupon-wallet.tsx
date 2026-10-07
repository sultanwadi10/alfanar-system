"use client";

import {
  type FormEvent,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import styles from "./customer-coupon-wallet.module.css";

export type CouponTransactionItem = {
  id: string;

  type:
    | "ADMIN_CREDIT"
    | "ORDER_DEBIT";

  amount: number;

  balanceBefore: number;
  balanceAfter: number;

  reason: string;

  createdAtLabel: string;
};

type CustomerCouponWalletProps = {
  customerId: string;

  couponBalance: number;

  isArchived: boolean;

  transactions:
    CouponTransactionItem[];
};

export function CustomerCouponWallet({
  customerId,
  couponBalance,
  isArchived,
  transactions,
}: CustomerCouponWalletProps) {
  const router = useRouter();

  const [amount, setAmount] =
    useState("1");

  const [reason, setReason] =
    useState("");

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

  const remainingCapacity =
    Math.max(
      0,
      22 - couponBalance,
    );

  async function handleCredit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const parsedAmount =
      Number(amount);

    if (
      !Number.isInteger(
        parsedAmount,
      ) ||
      parsedAmount < 1
    ) {
      setErrorMessage(
        "أدخل عدد كوبونات صحيح.",
      );

      return;
    }

    setLoading(true);

    setErrorMessage("");
    setSuccessMessage("");

    try {
      const response =
        await fetch(
          `/api/admin/customers/${customerId}/coupons/credit`,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
              amount:
                parsedAmount,

              reason,
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
            "تعذر إضافة الكوبونات.",
        );

        return;
      }

      setSuccessMessage(
        `تمت إضافة ${parsedAmount} كوبون بنجاح.`,
      );

      setAmount("1");

      setReason("");

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
    <section
      className={styles.wallet}
    >
      <div
        className={
          styles.header
        }
      >
        <div>
          <h2>
            محفظة الكوبونات
          </h2>

          <p>
            إدارة رصيد العميل
            ومراجعة سجل الحركات.
          </p>
        </div>

        <div
          className={
            styles.balance
          }
        >
          <strong>
            {couponBalance}
          </strong>

          <span>
            / 22
          </span>
        </div>
      </div>

      <div
        className={
          styles.progressTrack
        }
      >
        <span
          style={{
            width:
              `${Math.min(
                100,
                (couponBalance /
                  22) *
                  100,
              )}%`,
          }}
        />
      </div>

      <div
        className={
          styles.capacity
        }
      >
        متاح للإضافة:
        {" "}
        <strong>
          {remainingCapacity}
        </strong>
        {" "}
        كوبون
      </div>

      {!isArchived && (
        <form
          className={
            styles.creditForm
          }
          onSubmit={
            handleCredit
          }
        >
          <div
            className={
              styles.formGrid
            }
          >
            <label>
              عدد الكوبونات

              <input
                type="number"
                min="1"
                max={
                  Math.max(
                    1,
                    remainingCapacity,
                  )
                }
                step="1"
                value={amount}
                onChange={(
                  event,
                ) =>
                  setAmount(
                    event.target
                      .value,
                  )
                }
                disabled={
                  loading ||
                  remainingCapacity ===
                    0
                }
                required
              />
            </label>

            <label>
              سبب الإضافة

              <input
                type="text"
                value={reason}
                onChange={(
                  event,
                ) =>
                  setReason(
                    event.target
                      .value,
                  )
                }
                placeholder="مثال: شحن محفظة العميل"
                maxLength={200}
                disabled={
                  loading ||
                  remainingCapacity ===
                    0
                }
                required
              />
            </label>
          </div>

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

          <button
            type="submit"
            className={
              styles.creditButton
            }
            disabled={
              loading ||
              remainingCapacity ===
                0
            }
          >
            {remainingCapacity ===
            0
              ? "الرصيد وصل للحد الأعلى"
              : loading
                ? "جاري الإضافة..."
                : "إضافة كوبونات"}
          </button>
        </form>
      )}

      {isArchived && (
        <div
          className={
            styles.archivedMessage
          }
        >
          العميل مؤرشف. يجب استعادته
          قبل تنفيذ أي حركة على
          المحفظة.
        </div>
      )}

      <div
        className={
          styles.history
        }
      >
        <div
          className={
            styles.historyHeader
          }
        >
          <h3>
            سجل الحركات
          </h3>

          <span>
            {
              transactions.length
            }
            {" "}
            حركة
          </span>
        </div>

        {transactions.length ===
        0 ? (
          <div
            className={
              styles.emptyHistory
            }
          >
            لا توجد حركات كوبونات
            حتى الآن.
          </div>
        ) : (
          <div
            className={
              styles.transactionList
            }
          >
            {transactions.map(
              (transaction) => (
                <article
                  key={
                    transaction.id
                  }
                  className={
                    styles.transaction
                  }
                >
                  <div
                    className={
                      styles.transactionTop
                    }
                  >
                    <div>
                      <strong>
                        {transaction.type ===
                        "ADMIN_CREDIT"
                          ? `+${transaction.amount} كوبون`
                          : `-${transaction.amount} كوبون`}
                      </strong>

                      <span>
                        {transaction.type ===
                        "ADMIN_CREDIT"
                          ? "إضافة من الإدارة"
                          : "خصم من طلب"}
                      </span>
                    </div>

                    <time>
                      {
                        transaction.createdAtLabel
                      }
                    </time>
                  </div>

                  <p>
                    {
                      transaction.reason
                    }
                  </p>

                  <div
                    className={
                      styles.balanceChange
                    }
                  >
                    <span>
                      قبل:
                      {" "}
                      {
                        transaction.balanceBefore
                      }
                    </span>

                    <span>
                      ←
                    </span>

                    <span>
                      بعد:
                      {" "}
                      {
                        transaction.balanceAfter
                      }
                    </span>
                  </div>
                </article>
              ),
            )}
          </div>
        )}
      </div>
    </section>
  );
}