import {
  DashboardAutoRefresh,
} from "@/components/admin/dashboard-auto-refresh";
import {
  getAdminDashboardData,
} from "@/lib/admin/admin-dashboard-repository";

import styles from "./page.module.css";

export const dynamic =
  "force-dynamic";

function formatMoney(
  fils: number,
) {
  return `${(
    fils / 1000
  ).toFixed(3)} د.أ`;
}

function formatTime(
  date: Date,
) {
  return new Intl.DateTimeFormat(
    "ar-JO",
    {
      timeZone:
        "Asia/Amman",

      hour: "numeric",

      minute: "2-digit",
    },
  ).format(date);
}

function formatSaleTime(
  date: Date,
) {
  return new Intl.DateTimeFormat(
    "ar-JO",
    {
      timeZone:
        "Asia/Amman",

      hour: "numeric",

      minute: "2-digit",
    },
  ).format(date);
}

function getPaymentLabel(
  paymentMethod:
    | "CASH"
    | "CLICK",
) {
  return paymentMethod ===
    "CASH"
    ? "كاش"
    : "كليك / تحويل";
}

export default async function AdminPage() {
  const data =
    await getAdminDashboardData();

  const currentShift =
    data.currentShift;

  const paymentMethods = [
    {
      title: "كاش",

      value:
        formatMoney(
          data.todayCashFils,
        ),

      description:
        "المبالغ النقدية المسجلة اليوم",

      className:
        styles.cashPayment,
    },

    {
      title:
        "كليك / تحويل",

      value:
        formatMoney(
          data.todayClickFils,
        ),

      description:
        "الدفعات الإلكترونية المسجلة اليوم",

      className:
        styles.clickPayment,
    },

    {
      title: "كوبون",

      value:
        formatMoney(
          data.todayCouponFils,
        ),

      description:
        "سيتم احتساب استخدام الكوبونات مع نظام الطلبات",

      className:
        styles.couponPayment,
    },
  ];

  const topProducts =
    data.topProducts.length >
    0
      ? data.topProducts
      : [
          {
            name:
              "لا توجد مبيعات بعد",

            quantity: 0,

            percentage: 0,
          },
        ];

  return (
    <div
      className={
        styles.dashboard
      }
      dir="rtl"
    >
      <DashboardAutoRefresh />

      <section
        className={
          styles.hero
        }
      >
        <div>
          <p
            className={
              styles.eyebrow
            }
          >
            لوحة التحكم
          </p>

          <h1>
            أهلاً بك في نظام
            محطة الفنار
          </h1>

          <p
            className={
              styles.heroText
            }
          >
            ملخص مباشر للمبيعات
            والشفت الحالي وطرق
            الدفع وحالة التشغيل.
          </p>
        </div>

        <div
          className={
            styles.systemStatus
          }
        >
          <span
            className={
              styles.statusDot
            }
          />

          النظام يعمل
        </div>
      </section>

      <section
        className={
          styles.summaryGrid
        }
      >
        <article
          className={
            styles.summaryCard
          }
        >
          <div
            className={
              styles.summaryCardTop
            }
          >
            <span>
              إجمالي مبيعات اليوم
            </span>

            <span
              className={
                styles.cardIndicator
              }
            >
              اليوم
            </span>
          </div>

          <strong>
            {formatMoney(
              data.todaySalesFils,
            )}
          </strong>

          <small>
            مجموع عمليات البيع
            المباشر المسجلة اليوم
          </small>
        </article>

        <article
          className={
            styles.summaryCard
          }
        >
          <div
            className={
              styles.summaryCardTop
            }
          >
            <span>
              عمليات البيع اليوم
            </span>

            <span
              className={
                styles.cardIndicator
              }
            >
              {
                data.todaySaleCount
              }
            </span>
          </div>

          <strong>
            {
              data.todaySaleCount
            }
          </strong>

          <small>
            عدد عمليات البيع
            المباشر المكتملة
          </small>
        </article>

        <article
          className={
            styles.summaryCard
          }
        >
          <div
            className={
              styles.summaryCardTop
            }
          >
            <span>
              الكاش المتوقع
            </span>

            <span
              className={
                styles.cardIndicator
              }
            >
              نقدي
            </span>
          </div>

          <strong>
            {formatMoney(
              currentShift
                ?.cashSalesFils ??
                0,
            )}
          </strong>

          <small>
            الكاش المسجل في الشفت
            المفتوح حاليًا
          </small>
        </article>

        <article
          className={
            styles.summaryCard
          }
        >
          <div
            className={
              styles.summaryCardTop
            }
          >
            <span>
              الشفت الحالي
            </span>

            <span
              className={
                currentShift
                  ? styles.cardIndicator
                  : styles.neutralIndicator
              }
            >
              {currentShift
                ? "مفتوح"
                : "غير مفتوح"}
            </span>
          </div>

          <strong
            className={
              styles.shiftValue
            }
          >
            {currentShift
              ? currentShift.employeeName
              : "—"}
          </strong>

          <small>
            {currentShift
              ? `بدأ الساعة ${formatTime(
                  currentShift.openedAt,
                )}`
              : "لا يوجد موظف على شفت حاليًا"}
          </small>
        </article>
      </section>

      <section
        className={
          styles.section
        }
      >
        <div
          className={
            styles.sectionTitle
          }
        >
          <div>
            <h2>
              طرق الدفع اليوم
            </h2>

            <p>
              توزيع المبيعات حسب
              طريقة الدفع المسجلة
              في عمليات البيع.
            </p>
          </div>

          <span
            className={
              styles.sectionHint
            }
          >
            إجمالي:{" "}
            {formatMoney(
              data.todaySalesFils,
            )}
          </span>
        </div>

        <div
          className={
            styles.paymentGrid
          }
        >
          {paymentMethods.map(
            (method) => (
              <article
                key={
                  method.title
                }
                className={`${styles.paymentCard} ${method.className}`}
              >
                <div
                  className={
                    styles.paymentHeader
                  }
                >
                  <span
                    className={
                      styles.paymentDot
                    }
                  />

                  <span>
                    {
                      method.title
                    }
                  </span>
                </div>

                <strong>
                  {
                    method.value
                  }
                </strong>

                <p>
                  {
                    method.description
                  }
                </p>
              </article>
            ),
          )}
        </div>
      </section>

      <section
        className={
          styles.mainGrid
        }
      >
        <article
          className={
            styles.largeCard
          }
        >
          <div
            className={
              styles.cardHeader
            }
          >
            <div>
              <h2>
                حركة المبيعات
              </h2>

              <p>
                المبيعات الفعلية
                المسجلة خلال اليوم.
              </p>
            </div>

            <span>
              اليوم
            </span>
          </div>

          <div
            className={
              styles.chartArea
            }
          >
            <div
              className={
                styles.chartGrid
              }
            >
              <span />
              <span />
              <span />
              <span />
            </div>

            <div
              className={
                styles.chartBars
              }
            >
              {data.chartBars.map(
                (
                  height,
                  index,
                ) => (
                  <span
                    key={
                      index
                    }
                    style={{
                      height:
                        `${height}%`,

                      animationDelay:
                        `${index * 55}ms`,
                    }}
                  />
                ),
              )}
            </div>
          </div>

          <div
            className={
              styles.chartFooter
            }
          >
            <span>
              12 ص
            </span>

            <span>
              كل عمود يمثل ساعتين
              من مبيعات اليوم
            </span>

            <span>
              الآن
            </span>
          </div>
        </article>

        <article
          className={
            styles.sideCard
          }
        >
          <div
            className={
              styles.cardHeader
            }
          >
            <div>
              <h2>
                الأكثر مبيعًا
              </h2>

              <p>
                ترتيب المنتجات حسب
                الكمية المباعة اليوم.
              </p>
            </div>
          </div>

          <div
            className={
              styles.productsList
            }
          >
            {topProducts.map(
              (product) => (
                <div
                  key={
                    product.name
                  }
                  className={
                    styles.productItem
                  }
                >
                  <div
                    className={
                      styles.productInfo
                    }
                  >
                    <strong>
                      {
                        product.name
                      }
                    </strong>

                    <span>
                      {
                        product.quantity
                      }{" "}
                      وحدة
                    </span>
                  </div>

                  <div
                    className={
                      styles.progressTrack
                    }
                  >
                    <span
                      style={{
                        width:
                          `${product.percentage}%`,
                      }}
                    />
                  </div>

                  <small>
                    {
                      product.percentage
                    }
                    %
                  </small>
                </div>
              ),
            )}
          </div>
        </article>
      </section>

      <section
        className={
          styles.operationsGrid
        }
      >
        <article
          className={
            styles.operationCard
          }
        >
          <div
            className={
              styles.operationIcon
            }
          >
            م
          </div>

          <div>
            <span>
              حالة المخزون
            </span>

            <strong>
              لا توجد تنبيهات
            </strong>

            <small>
              سيتم ربط المخزون بعد
              إنهاء دورة البيع
              والتوصيل.
            </small>
          </div>
        </article>

        <article
          className={
            styles.operationCard
          }
        >
          <div
            className={
              styles.operationIcon
            }
          >
            ث
          </div>

          <div>
            <span>
              الثلاجة
            </span>

            <strong>
              لا توجد طلبات تعبئة
            </strong>

            <small>
              نظام الثلاجة سيتم
              ربطه لاحقًا.
            </small>
          </div>
        </article>

        <article
          className={
            styles.operationCard
          }
        >
          <div
            className={
              styles.operationIcon
            }
          >
            ت
          </div>

          <div>
            <span>
              التنبيهات
            </span>

            <strong>
              لا توجد تنبيهات جديدة
            </strong>

            <small>
              العمليات التي تحتاج
              تدخل الإدارة ستظهر
              هنا.
            </small>
          </div>
        </article>
      </section>

      <section
        className={
          styles.bottomGrid
        }
      >
        <article
          className={
            styles.tableCard
          }
        >
          <div
            className={
              styles.cardHeader
            }
          >
            <div>
              <h2>
                آخر عمليات البيع
              </h2>

              <p>
                أحدث عمليات البيع
                المباشر المسجلة
                اليوم.
              </p>
            </div>
          </div>

          {data.recentSales.length ===
          0 ? (
            <div
              className={
                styles.emptyOrders
              }
            >
              <div
                className={
                  styles.emptyIcon
                }
              >
                0
              </div>

              <strong>
                لا توجد عمليات بيع
                بعد
              </strong>

              <span>
                ستظهر عمليات البيع
                هنا فور تسجيلها من
                شاشة المحل.
              </span>
            </div>
          ) : (
            <div
              className={
                styles.productsList
              }
            >
              {data.recentSales.map(
                (sale) => (
                  <div
                    key={
                      sale.id
                    }
                    className={
                      styles.productItem
                    }
                  >
                    <div
                      className={
                        styles.productInfo
                      }
                    >
                      <strong>
                        {formatMoney(
                          sale.totalFils,
                        )}
                      </strong>

                      <span>
                        {
                          sale.employeeName
                        }{" "}
                        •{" "}
                        {getPaymentLabel(
                          sale.paymentMethod,
                        )}
                      </span>
                    </div>

                    <small>
                      {formatSaleTime(
                        sale.createdAt,
                      )}
                    </small>
                  </div>
                ),
              )}
            </div>
          )}
        </article>

        <article
          className={
            styles.shiftCard
          }
        >
          <div
            className={
              styles.cardHeader
            }
          >
            <div>
              <h2>
                الشفت الحالي
              </h2>

              <p>
                حالة التشغيل
                والموظف المسؤول.
              </p>
            </div>
          </div>

          <div
            className={
              styles.shiftContent
            }
          >
            <div
              className={
                styles.shiftRow
              }
            >
              <span>
                حالة الشفت
              </span>

              <strong>
                {currentShift
                  ? "مفتوح"
                  : "غير مفتوح"}
              </strong>
            </div>

            <div
              className={
                styles.shiftRow
              }
            >
              <span>
                الموظف
              </span>

              <strong>
                {currentShift
                  ? currentShift.employeeName
                  : "—"}
              </strong>
            </div>

            <div
              className={
                styles.shiftRow
              }
            >
              <span>
                وقت البداية
              </span>

              <strong>
                {currentShift
                  ? formatTime(
                      currentShift.openedAt,
                    )
                  : "—"}
              </strong>
            </div>

            <div
              className={
                styles.shiftRow
              }
            >
              <span>
                مبيعات الشفت
              </span>

              <strong>
                {currentShift
                  ? formatMoney(
                      currentShift.totalSalesFils,
                    )
                  : "—"}
              </strong>
            </div>

            <div
              className={
                styles.shiftRow
              }
            >
              <span>
                كاش الشفت
              </span>

              <strong>
                {currentShift
                  ? formatMoney(
                      currentShift.cashSalesFils,
                    )
                  : "—"}
              </strong>
            </div>

            <div
              className={
                styles.shiftRow
              }
            >
              <span>
                كليك / تحويل
              </span>

              <strong>
                {currentShift
                  ? formatMoney(
                      currentShift.clickSalesFils,
                    )
                  : "—"}
              </strong>
            </div>
          </div>
        </article>
      </section>
    </div>
  );
}