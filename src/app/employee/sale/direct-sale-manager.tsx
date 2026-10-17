"use client";

import {
  type FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import styles from "./direct-sale.module.css";

type ProductCategory =
  | "REFILL"
  | "NEW_BOTTLE"
  | "CUPS"
  | "SHRINK"
  | "COOLED"
  | "OTHER";

type SaleProduct = {
  id: string;

  name: string;

  category:
    ProductCategory;

  storePriceFils: number;

  imageUrl:
    | string
    | null;
};

type PaymentMethod =
  | "CASH"
  | "CLICK";

type CompletedSale = {
  totalFils: number;

  paymentMethod:
    PaymentMethod;
};

const categoryLabels: Record<
  ProductCategory,
  string
> = {
  REFILL:
    "تعبئة",

  NEW_BOTTLE:
    "قوارير جديدة",

  CUPS:
    "كاسات",

  SHRINK:
    "شرنك",

  COOLED:
    "مبرد",

  OTHER:
    "أخرى",
};

const categories: Array<{
  value:
    | "ALL"
    | ProductCategory;

  label: string;
}> = [
  {
    value: "ALL",
    label:
      "الكل",
  },
  {
    value: "REFILL",
    label:
      "تعبئة",
  },
  {
    value: "NEW_BOTTLE",
    label:
      "قوارير",
  },
  {
    value: "CUPS",
    label:
      "كاسات",
  },
  {
    value: "SHRINK",
    label:
      "شرنك",
  },
  {
    value: "COOLED",
    label:
      "مبرد",
  },
  {
    value: "OTHER",
    label:
      "أخرى",
  },
];

async function fetchProducts(): Promise<{
  products:
    SaleProduct[];

  error:
    string | null;
}> {
  try {
    const response =
      await fetch(
        "/api/operator/products",
        {
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
      return {
        products: [],

        error:
          data?.error?.message ??
          "تعذر تحميل المنتجات.",
      };
    }

    return {
      products:
        data.data.products ??
        [],

      error:
        null,
    };
  } catch {
    return {
      products: [],

      error:
        "تعذر الاتصال بالخادم.",
    };
  }
}

function formatPrice(
  fils: number,
) {
  return (
    fils / 1000
  ).toFixed(3);
}

function paymentLabel(
  paymentMethod:
    PaymentMethod,
) {
  return paymentMethod ===
    "CASH"
    ? "كاش"
    : "كليك / تحويل";
}

export default function DirectSaleManager() {
  const router =
    useRouter();

  const [
    products,
    setProducts,
  ] =
    useState<
      SaleProduct[]
    >([]);

  const [
    cart,
    setCart,
  ] =
    useState<
      Record<
        string,
        number
      >
    >({});

  const [
    search,
    setSearch,
  ] =
    useState("");

  const [
    category,
    setCategory,
  ] =
    useState<
      ProductCategory |
      "ALL"
    >("ALL");

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    submitting,
    setSubmitting,
  ] =
    useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] =
    useState("");

  const [
    paymentOpen,
    setPaymentOpen,
  ] =
    useState(false);

  const [
    paymentMethod,
    setPaymentMethod,
  ] =
    useState<
      PaymentMethod | null
    >(null);

  const [
    completedSale,
    setCompletedSale,
  ] =
    useState<
      CompletedSale | null
    >(null);

  useEffect(() => {
    let cancelled =
      false;

    void fetchProducts().then(
      (result) => {
        if (cancelled) {
          return;
        }

        setProducts(
          result.products,
        );

        setErrorMessage(
          result.error ?? "",
        );

        setLoading(
          false,
        );
      },
    );

    return () => {
      cancelled =
        true;
    };
  }, []);

  useEffect(() => {
    function handleBeforeUnload(
      event:
        BeforeUnloadEvent,
    ) {
      if (
        Object.keys(
          cart,
        ).length === 0
      ) {
        return;
      }

      event.preventDefault();

      event.returnValue =
        "";
    }

    window.addEventListener(
      "beforeunload",
      handleBeforeUnload,
    );

    return () => {
      window.removeEventListener(
        "beforeunload",
        handleBeforeUnload,
      );
    };
  }, [cart]);

  const filteredProducts =
    useMemo(() => {
      const query =
        search
          .trim()
          .toLowerCase();

      return products.filter(
        (product) => {
          const matchesSearch =
            !query ||
            product.name
              .toLowerCase()
              .includes(
                query,
              );

          const matchesCategory =
            category ===
              "ALL" ||
            product.category ===
              category;

          return (
            matchesSearch &&
            matchesCategory
          );
        },
      );
    }, [
      products,
      search,
      category,
    ]);

  const cartItems =
    useMemo(() => {
      return products
        .map(
          (product) => ({
            product,

            quantity:
              cart[
                product.id
              ] ?? 0,
          }),
        )
        .filter(
          (item) =>
            item.quantity >
            0,
        );
    }, [
      products,
      cart,
    ]);

  const totalQuantity =
    useMemo(() => {
      return cartItems.reduce(
        (
          total,
          item,
        ) =>
          total +
          item.quantity,
        0,
      );
    }, [
      cartItems,
    ]);

  const totalFils =
    useMemo(() => {
      return cartItems.reduce(
        (
          total,
          item,
        ) =>
          total +
          item.product
            .storePriceFils *
            item.quantity,
        0,
      );
    }, [
      cartItems,
    ]);

  function changeQuantity(
    productId: string,
    difference: number,
  ) {
    if (submitting) {
      return;
    }

    setErrorMessage("");

    setCart(
      (current) => {
        const currentQuantity =
          current[
            productId
          ] ?? 0;

        const next =
          Math.min(
            99,
            Math.max(
              0,
              currentQuantity +
                difference,
            ),
          );

        const updated = {
          ...current,
        };

        if (next === 0) {
          delete updated[
            productId
          ];
        } else {
          updated[
            productId
          ] = next;
        }

        return updated;
      },
    );
  }

  function clearCart() {
    if (
      cartItems.length ===
      0
    ) {
      return;
    }

    const confirmed =
      window.confirm(
        "هل تريد تفريغ السلة الحالية؟",
      );

    if (!confirmed) {
      return;
    }

    setCart({});

    setPaymentMethod(
      null,
    );

    setErrorMessage("");
  }

  function handleBack() {
    if (
      cartItems.length >
      0
    ) {
      const confirmed =
        window.confirm(
          "السلة تحتوي على منتجات. هل تريد الخروج وإلغاء العملية الحالية؟",
        );

      if (!confirmed) {
        return;
      }
    }

    router.push(
      "/employee",
    );
  }

  function openPayment() {
    if (
      cartItems.length ===
      0
    ) {
      setErrorMessage(
        "أضف منتجًا واحدًا على الأقل.",
      );

      return;
    }

    setErrorMessage("");

    setPaymentMethod(
      null,
    );

    setPaymentOpen(
      true,
    );
  }

  async function handleSubmit(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (
      cartItems.length ===
      0
    ) {
      setPaymentOpen(
        false,
      );

      setErrorMessage(
        "السلة فارغة.",
      );

      return;
    }

    if (!paymentMethod) {
      setErrorMessage(
        "اختر طريقة الدفع.",
      );

      return;
    }

    if (submitting) {
      return;
    }

    setSubmitting(
      true,
    );

    setErrorMessage("");

    try {
      const response =
        await fetch(
          "/api/operator/direct-sales",
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                paymentMethod,

                items:
                  cartItems.map(
                    (item) => ({
                      productId:
                        item.product.id,

                      quantity:
                        item.quantity,
                    }),
                  ),
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
          "تعذر تسجيل عملية البيع.",
        );

        return;
      }

      const completed:
        CompletedSale = {
          totalFils:
            data.data.totalFils,

          paymentMethod,
        };

      setCart({});

      setPaymentMethod(
        null,
      );

      setPaymentOpen(
        false,
      );

      setCompletedSale(
        completed,
      );
    } catch {
      setErrorMessage(
        "تعذر الاتصال بالخادم.",
      );
    } finally {
      setSubmitting(
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
        <div
          className={
            styles.brandBlock
          }
        >
          <span
            className={
              styles.brandMark
            }
          >
            ف
          </span>

          <div>
            <span
              className={
                styles.brandEyebrow
              }
            >
              نظام محطة الفنار
            </span>

            <h1>
              بيع مباشر
            </h1>

            <p>
              اضغط على المنتج
              لإضافته للسلة، ثم
              أكمل عملية الدفع.
            </p>
          </div>
        </div>

        <button
          type="button"
          className={
            styles.backButton
          }
          onClick={
            handleBack
          }
        >
          الرجوع للرئيسية
        </button>
      </header>

      {errorMessage && (
        <div
          className={
            styles.errorBox
          }
        >
          {errorMessage}
        </div>
      )}

      <div
        className={
          styles.layout
        }
      >
        <section
          className={
            styles.productsSide
          }
        >
          <div
            className={
              styles.productsHeader
            }
          >
            <div>
              <span>
                المنتجات
              </span>

              <h2>
                اختر المنتج
              </h2>
            </div>

            <span
              className={
                styles.productCount
              }
            >
              {
                filteredProducts.length
              }{" "}
              منتج
            </span>
          </div>

          <div
            className={
              styles.searchWrap
            }
          >
            <input
              type="search"
              value={search}
              onChange={(
                event,
              ) =>
                setSearch(
                  event.target
                    .value,
                )
              }
              placeholder="ابحث عن منتج..."
            />
          </div>

          <div
            className={
              styles.categoryBar
            }
          >
            {categories.map(
              (item) => (
                <button
                  key={
                    item.value
                  }
                  type="button"
                  className={
                    category ===
                    item.value
                      ? styles.categoryChipActive
                      : styles.categoryChip
                  }
                  onClick={() =>
                    setCategory(
                      item.value,
                    )
                  }
                >
                  {
                    item.label
                  }
                </button>
              ),
            )}
          </div>

          {loading ? (
            <div
              className={
                styles.loading
              }
            >
              جاري تحميل
              المنتجات...
            </div>
          ) : filteredProducts.length ===
            0 ? (
            <div
              className={
                styles.emptyProducts
              }
            >
              <strong>
                لا توجد منتجات
              </strong>

              <span>
                جرّب تغيير البحث
                أو التصنيف.
              </span>
            </div>
          ) : (
            <div
              className={
                styles.productsGrid
              }
            >
              {filteredProducts.map(
                (product) => {
                  const quantity =
                    cart[
                      product.id
                    ] ?? 0;

                  return (
                    <button
                      type="button"
                      key={
                        product.id
                      }
                      className={`${styles.productCard} ${
                        quantity >
                        0
                          ? styles.productCardInCart
                          : ""
                      }`}
                      onClick={() =>
                        changeQuantity(
                          product.id,
                          1,
                        )
                      }
                      disabled={
                        submitting
                      }
                    >
                      {quantity >
                        0 && (
                        <span
                          className={
                            styles.quantityBadge
                          }
                        >
                          {
                            quantity
                          }
                        </span>
                      )}

                      <div
                        className={
                          styles.productImage
                        }
                        style={
                          product.imageUrl
                            ? {
                                backgroundImage:
                                  `url("${product.imageUrl}")`,
                              }
                            : undefined
                        }
                      >
                        {!product.imageUrl && (
                          <span
                            className={
                              styles.placeholderDrop
                            }
                          >
                            ماء
                          </span>
                        )}
                      </div>

                      <div
                        className={
                          styles.productInfo
                        }
                      >
                        <small>
                          {
                            categoryLabels[
                              product.category
                            ]
                          }
                        </small>

                        <strong>
                          {
                            product.name
                          }
                        </strong>

                        <b>
                          {formatPrice(
                            product.storePriceFils,
                          )}{" "}
                          د.أ
                        </b>
                      </div>
                    </button>
                  );
                },
              )}
            </div>
          )}
        </section>

        <aside
          className={
            styles.cartSide
          }
        >
          <div
            className={
              styles.cartHeader
            }
          >
            <div>
              <span>
                العملية الحالية
              </span>

              <h2>
                السلة
              </h2>
            </div>

            <div
              className={
                styles.cartHeaderActions
              }
            >
              <strong>
                {
                  totalQuantity
                }{" "}
                قطعة
              </strong>

              {cartItems.length >
                0 && (
                <button
                  type="button"
                  className={
                    styles.clearCartButton
                  }
                  onClick={
                    clearCart
                  }
                >
                  تفريغ
                </button>
              )}
            </div>
          </div>

          <div
            className={
              styles.cartItems
            }
          >
            {cartItems.length ===
            0 ? (
              <div
                className={
                  styles.emptyCart
                }
              >
                <span
                  className={
                    styles.emptyCartIcon
                  }
                >
                  +
                </span>

                <strong>
                  السلة فارغة
                </strong>

                <small>
                  اضغط على أي
                  منتج لإضافته
                  مباشرة.
                </small>
              </div>
            ) : (
              cartItems.map(
                (item) => (
                  <div
                    key={
                      item.product.id
                    }
                    className={
                      styles.cartItem
                    }
                  >
                    <div
                      className={
                        styles.cartProduct
                      }
                    >
                      <strong>
                        {
                          item.product.name
                        }
                      </strong>

                      <span>
                        {formatPrice(
                          item.product
                            .storePriceFils,
                        )}{" "}
                        د.أ للوحدة
                      </span>
                    </div>

                    <div
                      className={
                        styles.quantity
                      }
                    >
                      <button
                        type="button"
                        aria-label="تقليل الكمية"
                        onClick={() =>
                          changeQuantity(
                            item.product.id,
                            -1,
                          )
                        }
                      >
                        −
                      </button>

                      <strong>
                        {
                          item.quantity
                        }
                      </strong>

                      <button
                        type="button"
                        aria-label="زيادة الكمية"
                        onClick={() =>
                          changeQuantity(
                            item.product.id,
                            1,
                          )
                        }
                      >
                        +
                      </button>
                    </div>

                    <b
                      className={
                        styles.lineTotal
                      }
                    >
                      {formatPrice(
                        item.product
                          .storePriceFils *
                          item.quantity,
                      )}{" "}
                      د.أ
                    </b>
                  </div>
                ),
              )
            )}
          </div>

          <div
            className={
              styles.cartFooter
            }
          >
            <div
              className={
                styles.totalBox
              }
            >
              <span>
                الإجمالي
              </span>

              <strong>
                {formatPrice(
                  totalFils,
                )}{" "}
                د.أ
              </strong>
            </div>

            <button
              type="button"
              className={
                styles.checkoutButton
              }
              disabled={
                cartItems.length ===
                  0 ||
                submitting
              }
              onClick={
                openPayment
              }
            >
              متابعة للدفع
            </button>

            <small
              className={
                styles.checkoutHint
              }
            >
              السعر النهائي يتم
              اعتماده من السيرفر
              عند تأكيد العملية.
            </small>
          </div>
        </aside>
      </div>

      {paymentOpen && (
        <div
          className={
            styles.modalOverlay
          }
          role="dialog"
          aria-modal="true"
          aria-label="اختيار طريقة الدفع"
        >
          <form
            className={
              styles.paymentModal
            }
            onSubmit={
              handleSubmit
            }
          >
            <div
              className={
                styles.modalHeader
              }
            >
              <div>
                <span>
                  إتمام العملية
                </span>

                <h2>
                  اختر طريقة الدفع
                </h2>
              </div>

              <button
                type="button"
                className={
                  styles.closeModalButton
                }
                disabled={
                  submitting
                }
                onClick={() => {
                  setPaymentOpen(
                    false,
                  );

                  setPaymentMethod(
                    null,
                  );

                  setErrorMessage(
                    "",
                  );
                }}
              >
                ×
              </button>
            </div>

            <div
              className={
                styles.paymentTotal
              }
            >
              <span>
                المبلغ المطلوب
              </span>

              <strong>
                {formatPrice(
                  totalFils,
                )}{" "}
                د.أ
              </strong>

              <small>
                {
                  totalQuantity
                }{" "}
                قطعة في السلة
              </small>
            </div>

            <div
              className={
                styles.paymentGrid
              }
            >
              <button
                type="button"
                className={
                  paymentMethod ===
                  "CASH"
                    ? styles.paymentOptionSelected
                    : styles.paymentOption
                }
                onClick={() =>
                  setPaymentMethod(
                    "CASH",
                  )
                }
              >
                <span
                  className={
                    styles.paymentIcon
                  }
                >
                  ك
                </span>

                <strong>
                  كاش
                </strong>

                <small>
                  دفع نقدي
                </small>
              </button>

              <button
                type="button"
                className={
                  paymentMethod ===
                  "CLICK"
                    ? styles.paymentOptionSelected
                    : styles.paymentOption
                }
                onClick={() =>
                  setPaymentMethod(
                    "CLICK",
                  )
                }
              >
                <span
                  className={
                    styles.paymentIcon
                  }
                >
                  C
                </span>

                <strong>
                  كليك / تحويل
                </strong>

                <small>
                  دفع إلكتروني
                </small>
              </button>
            </div>

            {errorMessage && (
              <div
                className={
                  styles.modalError
                }
              >
                {errorMessage}
              </div>
            )}

            <button
              type="submit"
              className={
                styles.confirmButton
              }
              disabled={
                submitting ||
                !paymentMethod
              }
            >
              {submitting
                ? "جاري تسجيل العملية..."
                : paymentMethod
                  ? `تأكيد ${paymentLabel(
                      paymentMethod,
                    )} — ${formatPrice(
                      totalFils,
                    )} د.أ`
                  : "اختر طريقة الدفع"}
            </button>
          </form>
        </div>
      )}

      {completedSale && (
        <div
          className={
            styles.modalOverlay
          }
          role="dialog"
          aria-modal="true"
          aria-label="تمت عملية البيع"
        >
          <div
            className={
              styles.successModal
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
                styles.successEyebrow
              }
            >
              تمت العملية
            </span>

            <h2>
              تم تسجيل البيع بنجاح
            </h2>

            <div
              className={
                styles.successAmount
              }
            >
              <strong>
                {formatPrice(
                  completedSale.totalFils,
                )}{" "}
                د.أ
              </strong>

              <span>
                {paymentLabel(
                  completedSale.paymentMethod,
                )}
              </span>
            </div>

            <div
              className={
                styles.successActions
              }
            >
              <button
                type="button"
                className={
                  styles.confirmButton
                }
                onClick={() =>
                  setCompletedSale(
                    null,
                  )
                }
              >
                عملية بيع جديدة
              </button>

              <button
                type="button"
                className={
                  styles.secondaryAction
                }
                onClick={() =>
                  router.push(
                    "/employee",
                  )
                }
              >
                العودة للرئيسية
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}