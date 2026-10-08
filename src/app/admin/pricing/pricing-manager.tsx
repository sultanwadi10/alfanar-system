"use client";

import {
  type ChangeEvent,
  type FormEvent,
  useMemo,
  useState,
} from "react";

import {
  PRODUCT_CATEGORIES,
  type Product,
  type ProductCategory,
  type ProductMutationInput,
} from "@/types/product";

import styles from "./pricing.module.css";

type PricingManagerProps = {
  initialProducts: Product[];
};

type ProductFormState = {
  name: string;

  category: ProductCategory;

  storePrice: string;

  deliveryPrice: string;

  isActive: boolean;

  showForEmployee: boolean;

  showForCustomerApp: boolean;

  requiresBottleOrigin: boolean;

  imageUrl: string | null;
};

type ProductApiResponse = {
  success: boolean;

  product?: Product;

  error?: {
    message?: string;
  };
};

const categoryLabels: Record<
  ProductCategory,
  string
> = {
  [PRODUCT_CATEGORIES.REFILL]:
    "تعبئة",

  [PRODUCT_CATEGORIES.NEW_BOTTLE]:
    "قوارير جديدة",

  [PRODUCT_CATEGORIES.CUPS]:
    "كاسات مياه",

  [PRODUCT_CATEGORIES.SHRINK]:
    "شرنك مياه",

  [PRODUCT_CATEGORIES.COOLED]:
    "مبرد",

  [PRODUCT_CATEGORIES.OTHER]:
    "أخرى",
};

const emptyForm: ProductFormState =
  {
    name: "",

    category:
      PRODUCT_CATEGORIES.OTHER,

    storePrice: "",

    deliveryPrice: "",

    isActive: true,

    showForEmployee: true,

    showForCustomerApp: true,

    requiresBottleOrigin:
      false,

    imageUrl: null,
  };

function formatPrice(
  fils: number,
) {
  return new Intl.NumberFormat(
    "en-JO",
    {
      minimumFractionDigits: 3,

      maximumFractionDigits: 3,
    },
  ).format(
    fils / 1000,
  );
}

function editablePrice(
  fils: number,
) {
  return (
    fils / 1000
  ).toFixed(3);
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

  if (
    !Number.isSafeInteger(
      whole,
    ) ||
    !Number.isSafeInteger(
      fraction,
    )
  ) {
    return null;
  }

  const fils =
    whole * 1000 +
    fraction;

  if (
    !Number.isSafeInteger(
      fils,
    ) ||
    fils < 0
  ) {
    return null;
  }

  return fils;
}

function toMutationInput(
  product: Product,
): ProductMutationInput {
  return {
    name: product.name,

    category:
      product.category,

    storePriceFils:
      product.storePriceFils,

    deliveryPriceFils:
      product.deliveryPriceFils,

    isActive:
      product.isActive,

    showForEmployee:
      product.showForEmployee,

    showForCustomerApp:
      product.showForCustomerApp,

    requiresBottleOrigin:
      product.requiresBottleOrigin,

    imageUrl:
      product.imageUrl,
  };
}

async function readApiResponse(
  response: Response,
): Promise<ProductApiResponse> {
  try {
    return (await response.json()) as ProductApiResponse;
  } catch {
    return {
      success: false,

      error: {
        message:
          "تعذر قراءة استجابة الخادم.",
      },
    };
  }
}

export default function PricingManager({
  initialProducts,
}: PricingManagerProps) {
  const [
    products,
    setProducts,
  ] =
    useState<Product[]>(
      initialProducts,
    );

  const [
    search,
    setSearch,
  ] =
    useState("");

  const [
    categoryFilter,
    setCategoryFilter,
  ] =
    useState<
      ProductCategory | "ALL"
    >("ALL");

  const [
    isModalOpen,
    setIsModalOpen,
  ] =
    useState(false);

  const [
    editingProductId,
    setEditingProductId,
  ] =
    useState<
      string | null
    >(null);

  const [
    form,
    setForm,
  ] =
    useState<ProductFormState>(
      emptyForm,
    );

  const [
    formError,
    setFormError,
  ] =
    useState<
      string | null
    >(null);

  const [
    actionError,
    setActionError,
  ] =
    useState<
      string | null
    >(null);

  const [
    isSubmitting,
    setIsSubmitting,
  ] =
    useState(false);

  const [
    busyProductId,
    setBusyProductId,
  ] =
    useState<
      string | null
    >(null);

  const [
    imageInputKey,
    setImageInputKey,
  ] =
    useState(0);

  const [
    localImagePreview,
    setLocalImagePreview,
  ] =
    useState<
      string | null
    >(null);

  const filteredProducts =
    useMemo(() => {
      const normalizedSearch =
        search
          .trim()
          .toLowerCase();

      return products.filter(
        (product) => {
          const matchesSearch =
            !normalizedSearch ||
            product.name
              .toLowerCase()
              .includes(
                normalizedSearch,
              );

          const matchesCategory =
            categoryFilter ===
              "ALL" ||
            product.category ===
              categoryFilter;

          return (
            matchesSearch &&
            matchesCategory
          );
        },
      );
    }, [
      products,
      search,
      categoryFilter,
    ]);

  const activeCount =
    products.filter(
      (product) =>
        product.isActive,
    ).length;

  const employeeVisibleCount =
    products.filter(
      (product) =>
        product.isActive &&
        product.showForEmployee,
    ).length;

  const appVisibleCount =
    products.filter(
      (product) =>
        product.isActive &&
        product.showForCustomerApp,
    ).length;

  function clearLocalImagePreview() {
    if (
      localImagePreview?.startsWith(
        "blob:",
      )
    ) {
      URL.revokeObjectURL(
        localImagePreview,
      );
    }

    setLocalImagePreview(
      null,
    );
  }

  function openAddModal() {
    clearLocalImagePreview();

    setEditingProductId(
      null,
    );

    setForm(
      emptyForm,
    );

    setFormError(
      null,
    );

    setActionError(
      null,
    );

    setImageInputKey(
      (current) =>
        current + 1,
    );

    setIsModalOpen(
      true,
    );
  }

  function openEditModal(
    product: Product,
  ) {
    clearLocalImagePreview();

    setEditingProductId(
      product.id,
    );

    setForm({
      name:
        product.name,

      category:
        product.category,

      storePrice:
        editablePrice(
          product.storePriceFils,
        ),

      deliveryPrice:
        editablePrice(
          product.deliveryPriceFils,
        ),

      isActive:
        product.isActive,

      showForEmployee:
        product.showForEmployee,

      showForCustomerApp:
        product.showForCustomerApp,

      requiresBottleOrigin:
        product.requiresBottleOrigin,

      imageUrl:
        product.imageUrl,
    });

    setFormError(
      null,
    );

    setActionError(
      null,
    );

    setImageInputKey(
      (current) =>
        current + 1,
    );

    setIsModalOpen(
      true,
    );
  }

  function closeModal() {
    if (isSubmitting) {
      return;
    }

    clearLocalImagePreview();

    setIsModalOpen(
      false,
    );

    setEditingProductId(
      null,
    );

    setForm(
      emptyForm,
    );

    setFormError(
      null,
    );
  }

  function handleImageChange(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file =
      event.target
        .files?.[0];

    if (!file) {
      return;
    }

    if (
      !file.type.startsWith(
        "image/",
      )
    ) {
      setFormError(
        "الملف المختار يجب أن يكون صورة.",
      );

      return;
    }

    const maxSize =
      5 *
      1024 *
      1024;

    if (
      file.size >
      maxSize
    ) {
      setFormError(
        "حجم الصورة يجب ألا يتجاوز 5 MB.",
      );

      return;
    }

    clearLocalImagePreview();

    const previewUrl =
      URL.createObjectURL(
        file,
      );

    setLocalImagePreview(
      previewUrl,
    );

    setFormError(
      null,
    );
  }

  function removeImage() {
    clearLocalImagePreview();

    setForm(
      (current) => ({
        ...current,

        imageUrl:
          null,
      }),
    );

    setImageInputKey(
      (current) =>
        current + 1,
    );
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    const name =
      form.name.trim();

    const storePriceFils =
      parsePriceToFils(
        form.storePrice,
      );

    const deliveryPriceFils =
      parsePriceToFils(
        form.deliveryPrice,
      );

    if (
      name.length < 2
    ) {
      setFormError(
        "اكتب اسم المنتج بشكل صحيح.",
      );

      return;
    }

    if (
      storePriceFils ===
      null
    ) {
      setFormError(
        "سعر المحل غير صالح. استخدم حتى 3 خانات عشرية.",
      );

      return;
    }

    if (
      deliveryPriceFils ===
      null
    ) {
      setFormError(
        "سعر التوصيل غير صالح. استخدم حتى 3 خانات عشرية.",
      );

      return;
    }

    const payload: ProductMutationInput =
      {
        name,

        category:
          form.category,

        storePriceFils,

        deliveryPriceFils,

        isActive:
          form.isActive,

        showForEmployee:
          form.showForEmployee,

        showForCustomerApp:
          form.showForCustomerApp,

        requiresBottleOrigin:
          form.requiresBottleOrigin,

        imageUrl:
          form.imageUrl,
      };

    setIsSubmitting(
      true,
    );

    setFormError(
      null,
    );

    setActionError(
      null,
    );

    try {
      const isEditing =
        Boolean(
          editingProductId,
        );

      const endpoint =
        isEditing
          ? `/api/admin/products/${encodeURIComponent(
              editingProductId!,
            )}`
          : "/api/admin/products";

      const response =
        await fetch(
          endpoint,
          {
            method:
              isEditing
                ? "PATCH"
                : "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify(
                payload,
              ),
          },
        );

      const data =
        await readApiResponse(
          response,
        );

      if (
        !response.ok ||
        !data.success ||
        !data.product
      ) {
        setFormError(
          data.error
            ?.message ??
            "تعذر حفظ المنتج.",
        );

        return;
      }

      if (isEditing) {
        setProducts(
          (current) =>
            current.map(
              (product) =>
                product.id ===
                data.product!.id
                  ? data.product!
                  : product,
            ),
        );
      } else {
        setProducts(
          (current) => [
            data.product!,
            ...current,
          ],
        );
      }

      closeModalAfterSave();
    } catch {
      setFormError(
        "حدث خطأ أثناء الاتصال بالخادم.",
      );
    } finally {
      setIsSubmitting(
        false,
      );
    }
  }

  function closeModalAfterSave() {
    clearLocalImagePreview();

    setIsModalOpen(
      false,
    );

    setEditingProductId(
      null,
    );

    setForm(
      emptyForm,
    );

    setFormError(
      null,
    );
  }

  async function toggleProductActive(
    product: Product,
  ) {
    if (busyProductId) {
      return;
    }

    setBusyProductId(
      product.id,
    );

    setActionError(
      null,
    );

    const updatedProduct: Product =
      {
        ...product,

        isActive:
          !product.isActive,
      };

    try {
      const response =
        await fetch(
          `/api/admin/products/${encodeURIComponent(
            product.id,
          )}`,
          {
            method:
              "PATCH",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify(
                toMutationInput(
                  updatedProduct,
                ),
              ),
          },
        );

      const data =
        await readApiResponse(
          response,
        );

      if (
        !response.ok ||
        !data.success ||
        !data.product
      ) {
        setActionError(
          data.error
            ?.message ??
            "تعذر تغيير حالة المنتج.",
        );

        return;
      }

      setProducts(
        (current) =>
          current.map(
            (item) =>
              item.id ===
              product.id
                ? data.product!
                : item,
          ),
      );
    } catch {
      setActionError(
        "حدث خطأ أثناء الاتصال بالخادم.",
      );
    } finally {
      setBusyProductId(
        null,
      );
    }
  }

  async function deleteProduct(
    product: Product,
  ) {
    if (busyProductId) {
      return;
    }

    const confirmed =
      window.confirm(
        `هل أنت متأكد من حذف "${product.name}"؟`,
      );

    if (!confirmed) {
      return;
    }

    setBusyProductId(
      product.id,
    );

    setActionError(
      null,
    );

    try {
      const response =
        await fetch(
          `/api/admin/products/${encodeURIComponent(
            product.id,
          )}`,
          {
            method:
              "DELETE",
          },
        );

      const data =
        await readApiResponse(
          response,
        );

      if (
        !response.ok ||
        !data.success
      ) {
        setActionError(
          data.error
            ?.message ??
            "تعذر حذف المنتج.",
        );

        return;
      }

      setProducts(
        (current) =>
          current.filter(
            (item) =>
              item.id !==
              product.id,
          ),
      );
    } catch {
      setActionError(
        "حدث خطأ أثناء الاتصال بالخادم.",
      );
    } finally {
      setBusyProductId(
        null,
      );
    }
  }

  const imagePreview =
    localImagePreview ??
    form.imageUrl;

  return (
    <main
      className={
        styles.page
      }
      dir="rtl"
    >
      <section
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
            إدارة المحل
          </p>

          <h1>
            المنتجات والأسعار
          </h1>

          <p
            className={
              styles.subtitle
            }
          >
            تحكم كامل
            بالمنتجات،
            أسعار المحل
            والتوصيل،
            والظهور للموظف
            والتطبيق.
          </p>
        </div>

        <button
          type="button"
          className={
            styles.primaryButton
          }
          onClick={
            openAddModal
          }
        >
          <span>+</span>
          إضافة منتج
        </button>
      </section>

      <section
        className={
          styles.notice
        }
      >
        <div
          className={
            styles.noticeIcon
          }
        >
          i
        </div>

        <div>
          <strong>
            تعبئة قارورة
            20 لتر
          </strong>

          <p>
            الموظف يستطيع
            تحديد كميات
            القوارير السعودية
            والأردنية داخل نفس
            الطلب، والسعر واحد
            للنوعين.
          </p>
        </div>
      </section>

      <section
        className={
          styles.previewNotice
        }
      >
        المنتجات والأسعار
        الآن محفوظة في
        Firestore. رفع صورة
        المنتج حاليًا معاينة
        فقط؛ سنربطه بـFirebase
        Storage في الخطوة
        التالية.
      </section>

      {actionError && (
        <div
          className={
            styles.errorBox
          }
        >
          {actionError}
        </div>
      )}

      <section
        className={
          styles.statsGrid
        }
      >
        <article
          className={
            styles.statCard
          }
        >
          <span>
            إجمالي المنتجات
          </span>

          <strong>
            {products.length}
          </strong>
        </article>

        <article
          className={
            styles.statCard
          }
        >
          <span>
            المنتجات الفعالة
          </span>

          <strong>
            {activeCount}
          </strong>
        </article>

        <article
          className={
            styles.statCard
          }
        >
          <span>
            ظاهرة للموظف
          </span>

          <strong>
            {
              employeeVisibleCount
            }
          </strong>
        </article>

        <article
          className={
            styles.statCard
          }
        >
          <span>
            ظاهرة بالتطبيق
          </span>

          <strong>
            {appVisibleCount}
          </strong>
        </article>
      </section>

      <section
        className={
          styles.toolbar
        }
      >
        <div
          className={
            styles.searchBox
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
            styles.filterBox
          }
        >
          <label
            htmlFor="category-filter"
          >
            التصنيف
          </label>

          <select
            id="category-filter"
            value={
              categoryFilter
            }
            onChange={(
              event,
            ) =>
              setCategoryFilter(
                event.target
                  .value as
                  | ProductCategory
                  | "ALL",
              )
            }
          >
            <option value="ALL">
              جميع المنتجات
            </option>

            {Object.entries(
              categoryLabels,
            ).map(
              ([
                value,
                label,
              ]) => (
                <option
                  key={
                    value
                  }
                  value={
                    value
                  }
                >
                  {label}
                </option>
              ),
            )}
          </select>
        </div>
      </section>

      {filteredProducts.length >
      0 ? (
        <section
          className={
            styles.productsGrid
          }
        >
          {filteredProducts.map(
            (product) => (
              <article
                key={
                  product.id
                }
                className={`${styles.productCard} ${
                  !product.isActive
                    ? styles.inactiveCard
                    : ""
                }`}
              >
                <div
                  className={
                    styles.productImage
                  }
                  style={
                    product.imageUrl
                      ? {
                          backgroundImage: `url("${product.imageUrl}")`,
                        }
                      : undefined
                  }
                >
                  {!product.imageUrl && (
                    <div
                      className={
                        styles.imagePlaceholder
                      }
                    >
                      <span>
                        صورة
                      </span>

                      <small>
                        بدون صورة
                      </small>
                    </div>
                  )}

                  <span
                    className={`${styles.statusBadge} ${
                      product.isActive
                        ? styles.activeBadge
                        : styles.inactiveBadge
                    }`}
                  >
                    {product.isActive
                      ? "فعال"
                      : "معطل"}
                  </span>
                </div>

                <div
                  className={
                    styles.productContent
                  }
                >
                  <div
                    className={
                      styles.productTitleRow
                    }
                  >
                    <div>
                      <span
                        className={
                          styles.category
                        }
                      >
                        {
                          categoryLabels[
                            product
                              .category
                          ]
                        }
                      </span>

                      <h2>
                        {
                          product.name
                        }
                      </h2>
                    </div>
                  </div>

                  <div
                    className={
                      styles.priceGrid
                    }
                  >
                    <div
                      className={
                        styles.priceBox
                      }
                    >
                      <span>
                        سعر المحل
                      </span>

                      <strong>
                        {formatPrice(
                          product.storePriceFils,
                        )}

                        <small>
                          د.أ
                        </small>
                      </strong>
                    </div>

                    <div
                      className={
                        styles.priceBox
                      }
                    >
                      <span>
                        سعر التوصيل
                      </span>

                      <strong>
                        {formatPrice(
                          product.deliveryPriceFils,
                        )}

                        <small>
                          د.أ
                        </small>
                      </strong>
                    </div>
                  </div>

                  <div
                    className={
                      styles.visibilityList
                    }
                  >
                    <span
                      className={
                        product.showForEmployee
                          ? styles.enabledTag
                          : styles.disabledTag
                      }
                    >
                      الموظف{" "}
                      {product.showForEmployee
                        ? "✓"
                        : "✕"}
                    </span>

                    <span
                      className={
                        product.showForCustomerApp
                          ? styles.enabledTag
                          : styles.disabledTag
                      }
                    >
                      التطبيق{" "}
                      {product.showForCustomerApp
                        ? "✓"
                        : "✕"}
                    </span>

                    {product.requiresBottleOrigin && (
                      <span
                        className={
                          styles.bottleTag
                        }
                      >
                        سعودي / أردني
                      </span>
                    )}
                  </div>
                </div>

                <div
                  className={
                    styles.cardActions
                  }
                >
                  <button
                    type="button"
                    className={
                      styles.editButton
                    }
                    disabled={
                      busyProductId ===
                      product.id
                    }
                    onClick={() =>
                      openEditModal(
                        product,
                      )
                    }
                  >
                    تعديل
                  </button>

                  <button
                    type="button"
                    className={
                      styles.secondaryButton
                    }
                    disabled={
                      busyProductId ===
                      product.id
                    }
                    onClick={() =>
                      void toggleProductActive(
                        product,
                      )
                    }
                  >
                    {product.isActive
                      ? "تعطيل"
                      : "تفعيل"}
                  </button>

                  <button
                    type="button"
                    className={
                      styles.deleteButton
                    }
                    disabled={
                      busyProductId ===
                      product.id
                    }
                    onClick={() =>
                      void deleteProduct(
                        product,
                      )
                    }
                  >
                    حذف
                  </button>
                </div>
              </article>
            ),
          )}
        </section>
      ) : (
        <section
          className={
            styles.emptyState
          }
        >
          <strong>
            لا توجد منتجات
          </strong>

          <p>
            جرّب تغيير البحث
            أو التصنيف.
          </p>
        </section>
      )}

      {isModalOpen && (
        <div
          className={
            styles.modalOverlay
          }
          onMouseDown={(
            event,
          ) => {
            if (
              event.target ===
                event.currentTarget &&
              !isSubmitting
            ) {
              closeModal();
            }
          }}
        >
          <div
            className={
              styles.modal
            }
          >
            <div
              className={
                styles.modalHeader
              }
            >
              <div>
                <span>
                  إدارة المنتج
                </span>

                <h2>
                  {editingProductId
                    ? "تعديل المنتج"
                    : "إضافة منتج جديد"}
                </h2>
              </div>

              <button
                type="button"
                className={
                  styles.closeButton
                }
                onClick={
                  closeModal
                }
                disabled={
                  isSubmitting
                }
                aria-label="إغلاق"
              >
                ×
              </button>
            </div>

            <form
              className={
                styles.form
              }
              onSubmit={
                handleSubmit
              }
            >
              <section
                className={
                  styles.formSection
                }
              >
                <h3>
                  معلومات المنتج
                </h3>

                <div
                  className={
                    styles.formGrid
                  }
                >
                  <label
                    className={
                      styles.fullField
                    }
                  >
                    <span>
                      اسم المنتج
                    </span>

                    <input
                      type="text"
                      value={
                        form.name
                      }
                      onChange={(
                        event,
                      ) =>
                        setForm(
                          (
                            current,
                          ) => ({
                            ...current,

                            name:
                              event
                                .target
                                .value,
                          }),
                        )
                      }
                      placeholder="مثال: تعبئة قارورة 20 لتر"
                    />
                  </label>

                  <label>
                    <span>
                      التصنيف
                    </span>

                    <select
                      value={
                        form.category
                      }
                      onChange={(
                        event,
                      ) =>
                        setForm(
                          (
                            current,
                          ) => ({
                            ...current,

                            category:
                              event
                                .target
                                .value as ProductCategory,
                          }),
                        )
                      }
                    >
                      {Object.entries(
                        categoryLabels,
                      ).map(
                        ([
                          value,
                          label,
                        ]) => (
                          <option
                            key={
                              value
                            }
                            value={
                              value
                            }
                          >
                            {
                              label
                            }
                          </option>
                        ),
                      )}
                    </select>
                  </label>

                  <div
                    className={
                      styles.helperField
                    }
                  >
                    <span>
                      ملاحظة
                    </span>

                    <p>
                      التصنيف لترتيب
                      المنتجات، أما
                      الأسعار فيتحكم
                      بها الأدمن
                      مباشرة.
                    </p>
                  </div>
                </div>
              </section>

              <section
                className={
                  styles.formSection
                }
              >
                <h3>
                  الأسعار
                </h3>

                <div
                  className={
                    styles.formGrid
                  }
                >
                  <label>
                    <span>
                      سعر المحل
                    </span>

                    <div
                      className={
                        styles.priceInput
                      }
                    >
                      <input
                        type="number"
                        min="0"
                        step="0.001"
                        value={
                          form.storePrice
                        }
                        onChange={(
                          event,
                        ) =>
                          setForm(
                            (
                              current,
                            ) => ({
                              ...current,

                              storePrice:
                                event
                                  .target
                                  .value,
                            }),
                          )
                        }
                        placeholder="0.500"
                      />

                      <b>
                        د.أ
                      </b>
                    </div>
                  </label>

                  <label>
                    <span>
                      سعر التوصيل
                    </span>

                    <div
                      className={
                        styles.priceInput
                      }
                    >
                      <input
                        type="number"
                        min="0"
                        step="0.001"
                        value={
                          form.deliveryPrice
                        }
                        onChange={(
                          event,
                        ) =>
                          setForm(
                            (
                              current,
                            ) => ({
                              ...current,

                              deliveryPrice:
                                event
                                  .target
                                  .value,
                            }),
                          )
                        }
                        placeholder="0.850"
                      />

                      <b>
                        د.أ
                      </b>
                    </div>
                  </label>
                </div>

                <p
                  className={
                    styles.formHint
                  }
                >
                  الأدمن يستطيع
                  تغيير سعر المحل
                  وسعر التوصيل
                  بشكل مستقل.
                </p>
              </section>

              <section
                className={
                  styles.formSection
                }
              >
                <h3>
                  صورة المنتج
                </h3>

                <div
                  className={
                    styles.imageEditor
                  }
                >
                  <div
                    className={
                      styles.imagePreview
                    }
                    style={
                      imagePreview
                        ? {
                            backgroundImage: `url("${imagePreview}")`,
                          }
                        : undefined
                    }
                  >
                    {!imagePreview && (
                      <span>
                        لا توجد صورة
                      </span>
                    )}
                  </div>

                  <div
                    className={
                      styles.imageControls
                    }
                  >
                    <label
                      className={
                        styles.uploadButton
                      }
                    >
                      اختيار صورة

                      <input
                        key={
                          imageInputKey
                        }
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={
                          handleImageChange
                        }
                      />
                    </label>

                    {imagePreview && (
                      <button
                        type="button"
                        className={
                          styles.removeImageButton
                        }
                        onClick={
                          removeImage
                        }
                      >
                        حذف الصورة
                      </button>
                    )}

                    <small>
                      الصورة المختارة
                      حاليًا للمعاينة
                      فقط. الحفظ
                      الحقيقي سيتم
                      ربطه بـStorage
                      مباشرة بعد هذه
                      المرحلة.
                    </small>
                  </div>
                </div>
              </section>

              <section
                className={
                  styles.formSection
                }
              >
                <h3>
                  الظهور والحالة
                </h3>

                <div
                  className={
                    styles.switchList
                  }
                >
                  <label
                    className={
                      styles.switchRow
                    }
                  >
                    <div>
                      <strong>
                        المنتج فعال
                      </strong>
                    </div>

                    <input
                      type="checkbox"
                      checked={
                        form.isActive
                      }
                      onChange={(
                        event,
                      ) =>
                        setForm(
                          (
                            current,
                          ) => ({
                            ...current,

                            isActive:
                              event
                                .target
                                .checked,
                          }),
                        )
                      }
                    />
                  </label>

                  <label
                    className={
                      styles.switchRow
                    }
                  >
                    <div>
                      <strong>
                        يظهر للموظف
                      </strong>
                    </div>

                    <input
                      type="checkbox"
                      checked={
                        form.showForEmployee
                      }
                      onChange={(
                        event,
                      ) =>
                        setForm(
                          (
                            current,
                          ) => ({
                            ...current,

                            showForEmployee:
                              event
                                .target
                                .checked,
                          }),
                        )
                      }
                    />
                  </label>

                  <label
                    className={
                      styles.switchRow
                    }
                  >
                    <div>
                      <strong>
                        يظهر للزبائن
                      </strong>
                    </div>

                    <input
                      type="checkbox"
                      checked={
                        form.showForCustomerApp
                      }
                      onChange={(
                        event,
                      ) =>
                        setForm(
                          (
                            current,
                          ) => ({
                            ...current,

                            showForCustomerApp:
                              event
                                .target
                                .checked,
                          }),
                        )
                      }
                    />
                  </label>

                  <label
                    className={
                      styles.switchRow
                    }
                  >
                    <div>
                      <strong>
                        يتطلب تحديد
                        نوع القارورة
                        عند الطلب
                      </strong>
                    </div>

                    <input
                      type="checkbox"
                      checked={
                        form.requiresBottleOrigin
                      }
                      onChange={(
                        event,
                      ) =>
                        setForm(
                          (
                            current,
                          ) => ({
                            ...current,

                            requiresBottleOrigin:
                              event
                                .target
                                .checked,
                          }),
                        )
                      }
                    />
                  </label>
                </div>
              </section>

              {formError && (
                <div
                  className={
                    styles.errorBox
                  }
                >
                  {formError}
                </div>
              )}

              <div
                className={
                  styles.formActions
                }
              >
                <button
                  type="submit"
                  className={
                    styles.primaryButton
                  }
                  disabled={
                    isSubmitting
                  }
                >
                  {isSubmitting
                    ? "جاري الحفظ..."
                    : editingProductId
                      ? "حفظ التعديلات"
                      : "إضافة المنتج"}
                </button>

                <button
                  type="button"
                  className={
                    styles.cancelButton
                  }
                  disabled={
                    isSubmitting
                  }
                  onClick={
                    closeModal
                  }
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}