import "server-only";

import {
  Timestamp,
  type DocumentData,
  type DocumentSnapshot,
} from "firebase-admin/firestore";

import { getFirebaseAdminFirestore } from "@/lib/firebase/admin";
import {
  PRODUCT_CATEGORIES,
  type Product,
  type ProductMutationInput,
} from "@/types/product";

const PRODUCTS_COLLECTION =
  "products";

type ProductRecord = {
  name: string;

  category: Product["category"];

  storePriceFils: number;

  deliveryPriceFils: number;

  isActive: boolean;

  showForEmployee: boolean;

  showForCustomerApp: boolean;

  requiresBottleOrigin: boolean;

  imageUrl: string | null;

  isDeleted: boolean;

  createdByAuthUid: string;

  updatedByAuthUid: string;

  deletedByAuthUid:
    | string
    | null;

  createdAt: Timestamp;

  updatedAt: Timestamp;

  deletedAt:
    | Timestamp
    | null;
};

type DefaultProduct = {
  id: string;

  product: ProductMutationInput;
};

const DEFAULT_PRODUCTS: DefaultProduct[] =
  [
    {
      id: "refill-20l",

      product: {
        name:
          "تعبئة قارورة 20 لتر",

        category:
          PRODUCT_CATEGORIES.REFILL,

        storePriceFils: 500,

        deliveryPriceFils: 850,

        isActive: true,

        showForEmployee: true,

        showForCustomerApp: true,

        requiresBottleOrigin: true,

        imageUrl: null,
      },
    },

    {
      id: "refill-10l",

      product: {
        name:
          "تعبئة قارورة 10 لتر",

        category:
          PRODUCT_CATEGORIES.REFILL,

        storePriceFils: 250,

        deliveryPriceFils: 500,

        isActive: true,

        showForEmployee: true,

        showForCustomerApp: true,

        requiresBottleOrigin: false,

        imageUrl: null,
      },
    },

    {
      id: "bottle-saudi-crystal",

      product: {
        name:
          "قارورة جديدة سعودي - كريستال",

        category:
          PRODUCT_CATEGORIES.NEW_BOTTLE,

        storePriceFils: 5000,

        deliveryPriceFils: 5250,

        isActive: true,

        showForEmployee: true,

        showForCustomerApp: true,

        requiresBottleOrigin: false,

        imageUrl: null,
      },
    },

    {
      id: "bottle-saudi-tear",

      product: {
        name:
          "قارورة جديدة سعودي - دمعة",

        category:
          PRODUCT_CATEGORIES.NEW_BOTTLE,

        storePriceFils: 4000,

        deliveryPriceFils: 4250,

        isActive: true,

        showForEmployee: true,

        showForCustomerApp: true,

        requiresBottleOrigin: false,

        imageUrl: null,
      },
    },

    {
      id: "bottle-jordanian",

      product: {
        name:
          "قارورة جديدة أردني",

        category:
          PRODUCT_CATEGORIES.NEW_BOTTLE,

        storePriceFils: 3500,

        deliveryPriceFils: 3750,

        isActive: true,

        showForEmployee: true,

        showForCustomerApp: true,

        requiresBottleOrigin: false,

        imageUrl: null,
      },
    },

    {
      id: "bottle-saudi-small",

      product: {
        name:
          "قارورة جديدة سعودي - صغير",

        category:
          PRODUCT_CATEGORIES.NEW_BOTTLE,

        storePriceFils: 3000,

        deliveryPriceFils: 3250,

        isActive: true,

        showForEmployee: true,

        showForCustomerApp: true,

        requiresBottleOrigin: false,

        imageUrl: null,
      },
    },

    {
      id: "cups-evan-200-40",

      product: {
        name:
          "كرتونة كاسات إيفان 200 مل × 40",

        category:
          PRODUCT_CATEGORIES.CUPS,

        storePriceFils: 1000,

        deliveryPriceFils: 1250,

        isActive: true,

        showForEmployee: true,

        showForCustomerApp: true,

        requiresBottleOrigin: false,

        imageUrl: null,
      },
    },

    {
      id: "cups-nab3-alhaj-200-40",

      product: {
        name:
          "كرتونة كاسات نبع الحاج 200 مل × 40",

        category:
          PRODUCT_CATEGORIES.CUPS,

        storePriceFils: 1000,

        deliveryPriceFils: 1250,

        isActive: true,

        showForEmployee: true,

        showForCustomerApp: true,

        requiresBottleOrigin: false,

        imageUrl: null,
      },
    },

    {
      id: "cups-evan-250-40",

      product: {
        name:
          "كرتونة إيفان 250 مل × 40",

        category:
          PRODUCT_CATEGORIES.CUPS,

        storePriceFils: 1250,

        deliveryPriceFils: 1500,

        isActive: true,

        showForEmployee: true,

        showForCustomerApp: true,

        requiresBottleOrigin: false,

        imageUrl: null,
      },
    },

    {
      id: "cups-evan-150-60",

      product: {
        name:
          "كرتونة إيفان 150 مل × 60",

        category:
          PRODUCT_CATEGORIES.CUPS,

        storePriceFils: 1250,

        deliveryPriceFils: 1500,

        isActive: true,

        showForEmployee: true,

        showForCustomerApp: true,

        requiresBottleOrigin: false,

        imageUrl: null,
      },
    },

    {
      id: "cooled-carton",

      product: {
        name:
          "كرتون مبرد",

        category:
          PRODUCT_CATEGORIES.COOLED,

        storePriceFils: 1500,

        deliveryPriceFils: 1750,

        isActive: true,

        showForEmployee: true,

        showForCustomerApp: true,

        requiresBottleOrigin: false,

        imageUrl: null,
      },
    },

    {
      id: "shrink-1500-6",

      product: {
        name:
          "شرنك ماء 1.5 لتر × 6",

        category:
          PRODUCT_CATEGORIES.SHRINK,

        storePriceFils: 1000,

        deliveryPriceFils: 1250,

        isActive: true,

        showForEmployee: true,

        showForCustomerApp: true,

        requiresBottleOrigin: false,

        imageUrl: null,
      },
    },

    {
      id: "shrink-500-12",

      product: {
        name:
          "شرنك ماء 500 مل × 12",

        category:
          PRODUCT_CATEGORIES.SHRINK,

        storePriceFils: 1150,

        deliveryPriceFils: 1400,

        isActive: true,

        showForEmployee: true,

        showForCustomerApp: true,

        requiresBottleOrigin: false,

        imageUrl: null,
      },
    },

    {
      id: "shrink-250-20",

      product: {
        name:
          "شرنك ماء 250 مل × 20",

        category:
          PRODUCT_CATEGORIES.SHRINK,

        storePriceFils: 1250,

        deliveryPriceFils: 1500,

        isActive: true,

        showForEmployee: true,

        showForCustomerApp: true,

        requiresBottleOrigin: false,

        imageUrl: null,
      },
    },
  ];

function toProduct(
  snapshot: DocumentSnapshot<DocumentData>,
): Product {
  const data =
    snapshot.data() as ProductRecord;

  return {
    id: snapshot.id,

    name: data.name,

    category: data.category,

    storePriceFils:
      data.storePriceFils,

    deliveryPriceFils:
      data.deliveryPriceFils,

    isActive:
      data.isActive,

    showForEmployee:
      data.showForEmployee,

    showForCustomerApp:
      data.showForCustomerApp,

    requiresBottleOrigin:
      data.requiresBottleOrigin,

    imageUrl:
      data.imageUrl ?? null,
  };
}

export async function ensureDefaultProducts(
  adminAuthUid: string,
) {
  const firestore =
    getFirebaseAdminFirestore();

  const collection =
    firestore.collection(
      PRODUCTS_COLLECTION,
    );

  const existing =
    await collection
      .limit(1)
      .get();

  if (!existing.empty) {
    return;
  }

  const batch =
    firestore.batch();

  const now =
    Timestamp.now();

  for (const item of DEFAULT_PRODUCTS) {
    const reference =
      collection.doc(
        item.id,
      );

    const record: ProductRecord =
      {
        ...item.product,

        isDeleted: false,

        createdByAuthUid:
          adminAuthUid,

        updatedByAuthUid:
          adminAuthUid,

        deletedByAuthUid:
          null,

        createdAt: now,

        updatedAt: now,

        deletedAt: null,
      };

    batch.set(
      reference,
      record,
    );
  }

  await batch.commit();
}

export async function listProducts(): Promise<
  Product[]
> {
  const firestore =
    getFirebaseAdminFirestore();

  const snapshot =
    await firestore
      .collection(
        PRODUCTS_COLLECTION,
      )
      .get();

  return snapshot.docs
    .filter((document) => {
      const data =
        document.data() as ProductRecord;

      return !data.isDeleted;
    })
    .map(toProduct)
    .sort((first, second) =>
      first.name.localeCompare(
        second.name,
        "ar",
      ),
    );
}

export async function createProductRecord(
  input: ProductMutationInput,
  adminAuthUid: string,
): Promise<Product> {
  const firestore =
    getFirebaseAdminFirestore();

  const reference =
    firestore
      .collection(
        PRODUCTS_COLLECTION,
      )
      .doc();

  const now =
    Timestamp.now();

  const record: ProductRecord =
    {
      ...input,

      isDeleted: false,

      createdByAuthUid:
        adminAuthUid,

      updatedByAuthUid:
        adminAuthUid,

      deletedByAuthUid:
        null,

      createdAt: now,

      updatedAt: now,

      deletedAt: null,
    };

  await reference.set(
    record,
  );

  return {
    id: reference.id,
    ...input,
  };
}

export async function updateProductRecord(
  productId: string,
  input: ProductMutationInput,
  adminAuthUid: string,
): Promise<Product | null> {
  const firestore =
    getFirebaseAdminFirestore();

  const reference =
    firestore
      .collection(
        PRODUCTS_COLLECTION,
      )
      .doc(productId);

  return firestore.runTransaction(
    async (transaction) => {
      const snapshot =
        await transaction.get(
          reference,
        );

      if (!snapshot.exists) {
        return null;
      }

      const current =
        snapshot.data() as ProductRecord;

      if (current.isDeleted) {
        return null;
      }

      transaction.update(
        reference,
        {
          ...input,

          updatedByAuthUid:
            adminAuthUid,

          updatedAt:
            Timestamp.now(),
        },
      );

      return {
        id: productId,
        ...input,
      };
    },
  );
}

export async function deleteProductRecord(
  productId: string,
  adminAuthUid: string,
): Promise<boolean> {
  const firestore =
    getFirebaseAdminFirestore();

  const reference =
    firestore
      .collection(
        PRODUCTS_COLLECTION,
      )
      .doc(productId);

  return firestore.runTransaction(
    async (transaction) => {
      const snapshot =
        await transaction.get(
          reference,
        );

      if (!snapshot.exists) {
        return false;
      }

      const current =
        snapshot.data() as ProductRecord;

      if (current.isDeleted) {
        return false;
      }

      const now =
        Timestamp.now();

      transaction.update(
        reference,
        {
          isDeleted: true,

          isActive: false,

          updatedByAuthUid:
            adminAuthUid,

          deletedByAuthUid:
            adminAuthUid,

          updatedAt: now,

          deletedAt: now,
        },
      );

      return true;
    },
  );
}