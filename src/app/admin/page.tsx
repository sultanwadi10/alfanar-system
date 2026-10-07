import styles from "./page.module.css";

const paymentMethods = [
  {
    title: "كاش",
    value: "0.000 د.أ",
    description: "المبالغ النقدية المسجلة اليوم",
    className: styles.cashPayment,
  },
  {
    title: "كليك / تحويل",
    value: "0.000 د.أ",
    description: "الدفعات الإلكترونية المسجلة",
    className: styles.clickPayment,
  },
  {
    title: "كوبون",
    value: "0.000 د.أ",
    description: "القيمة المستخدمة من محفظة الكوبونات",
    className: styles.couponPayment,
  },
];

const topProducts = [
  {
    name: "لا توجد مبيعات بعد",
    quantity: 0,
    percentage: 0,
  },
];

const chartBars = [
  28,
  46,
  34,
  58,
  44,
  72,
  52,
  68,
  40,
  61,
  49,
  76,
];

export default function AdminPage() {
  return (
    <div
      className={styles.dashboard}
      dir="rtl"
    >
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>
            لوحة التحكم
          </p>

          <h1>
            أهلاً بك في نظام محطة الفنار
          </h1>

          <p className={styles.heroText}>
            ملخص سريع للمبيعات والطلبات
            والشفتات والمخزون وحالة التشغيل.
          </p>
        </div>

        <div className={styles.systemStatus}>
          <span
            className={styles.statusDot}
          />

          النظام يعمل
        </div>
      </section>

      <section
        className={styles.summaryGrid}
      >
        <article
          className={styles.summaryCard}
        >
          <div
            className={
              styles.summaryCardTop
            }
          >
            <span>إجمالي مبيعات اليوم</span>

            <span
              className={
                styles.cardIndicator
              }
            >
              اليوم
            </span>
          </div>

          <strong>
            0.000 د.أ
          </strong>

          <small>
            إجمالي جميع طرق الدفع
          </small>
        </article>

        <article
          className={styles.summaryCard}
        >
          <div
            className={
              styles.summaryCardTop
            }
          >
            <span>طلبات اليوم</span>

            <span
              className={
                styles.cardIndicator
              }
            >
              0
            </span>
          </div>

          <strong>
            0
          </strong>

          <small>
            الطلبات الجديدة والمكتملة
          </small>
        </article>

        <article
          className={styles.summaryCard}
        >
          <div
            className={
              styles.summaryCardTop
            }
          >
            <span>الكاش المتوقع</span>

            <span
              className={
                styles.cardIndicator
              }
            >
              نقدي
            </span>
          </div>

          <strong>
            0.000 د.أ
          </strong>

          <small>
            النقد الفعلي المتوقع داخل الصندوق
          </small>
        </article>

        <article
          className={styles.summaryCard}
        >
          <div
            className={
              styles.summaryCardTop
            }
          >
            <span>الشفت الحالي</span>

            <span
              className={
                styles.neutralIndicator
              }
            >
              غير مفتوح
            </span>
          </div>

          <strong
            className={
              styles.shiftValue
            }
          >
            —
          </strong>

          <small>
            لا يوجد موظف على شفت حاليًا
          </small>
        </article>
      </section>

      <section className={styles.section}>
        <div
          className={styles.sectionTitle}
        >
          <div>
            <h2>
              طرق الدفع اليوم
            </h2>

            <p>
              توزيع المبيعات حسب طريقة الدفع
              التي يسجلها الموظف.
            </p>
          </div>

          <span
            className={
              styles.sectionHint
            }
          >
            إجمالي: 0.000 د.أ
          </span>
        </div>

        <div
          className={styles.paymentGrid}
        >
          {paymentMethods.map(
            (method) => (
              <article
                key={method.title}
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
                    {method.title}
                  </span>
                </div>

                <strong>
                  {method.value}
                </strong>

                <p>
                  {method.description}
                </p>
              </article>
            ),
          )}
        </div>
      </section>

      <section
        className={styles.mainGrid}
      >
        <article
          className={styles.largeCard}
        >
          <div
            className={styles.cardHeader}
          >
            <div>
              <h2>
                حركة المبيعات
              </h2>

              <p>
                نظرة سريعة على نشاط المبيعات
                خلال اليوم.
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
              {chartBars.map(
                (height, index) => (
                  <span
                    key={`${height}-${index}`}
                    style={{
                      height: `${height}%`,
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
            <span>بداية اليوم</span>

            <span>
              سيتم ربط الرسم بالمبيعات الفعلية
            </span>

            <span>الآن</span>
          </div>
        </article>

        <article
          className={styles.sideCard}
        >
          <div
            className={styles.cardHeader}
          >
            <div>
              <h2>
                الأكثر مبيعًا
              </h2>

              <p>
                ترتيب المنتجات حسب الكمية.
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
                  key={product.name}
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
                      {product.name}
                    </strong>

                    <span>
                      {product.quantity}
                      {" "}
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
                    {product.percentage}%
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
              ستظهر تنبيهات انخفاض المخزون هنا.
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
              طلبات إعادة تعبئة الثلاجة ستظهر هنا.
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
              العمليات التي تحتاج تدخل الإدارة.
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
          className={styles.tableCard}
        >
          <div
            className={styles.cardHeader}
          >
            <div>
              <h2>
                آخر الطلبات
              </h2>

              <p>
                أحدث العمليات المسجلة في النظام.
              </p>
            </div>
          </div>

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
              لا توجد طلبات بعد
            </strong>

            <span>
              ستظهر آخر الطلبات هنا عند بدء التشغيل.
            </span>
          </div>
        </article>

        <article
          className={styles.shiftCard}
        >
          <div
            className={styles.cardHeader}
          >
            <div>
              <h2>
                الشفت الحالي
              </h2>

              <p>
                حالة التشغيل والموظف المسؤول.
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
                غير مفتوح
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
                —
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
                —
              </strong>
            </div>

            <div
              className={
                styles.shiftRow
              }
            >
              <span>
                نوع الشفت
              </span>

              <strong>
                —
              </strong>
            </div>
          </div>
        </article>
      </section>
    </div>
  );
}