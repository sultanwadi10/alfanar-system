import "server-only";

import { Timestamp } from "firebase-admin/firestore";

import { getFirebaseAdminFirestore } from "@/lib/firebase/admin";
import {
  ACTIVE_STORE_SHIFTS_COLLECTION,
  getActiveStoreShiftDocumentId,
  SHIFT_STATUSES,
} from "@/lib/shifts/shift-repository";

const SHIFTS_COLLECTION =
  "shifts";

const PRODUCTS_COLLECTION =
  "products";

const DIRECT_SALES_COLLECTION =
  "directSales";

export class NoActiveShiftError extends Error {
  constructor(
    message =
      "لا يوجد شفت مفتوح.",
  ) {
    super(message);

    this.name =
      "NoActiveShiftError";
  }
}

export class ProductUnavailableError extends Error {
  constructor(
    productName?: string,
  ) {
    super(
      productName
        ? `المنتج "${productName}" غير متاح للبيع حاليًا.`
        : "أحد المنتجات غير متاح للبيع حاليًا.",
    );

    this.name =
      "ProductUnavailableError";
  }
}

type ShiftRecord = {
  status: string;

  openedByEmployeeId: string;

  openedByEmployeeNameSnapshot: string;

  saleCount: number;

  totalSalesFils: number;

  cashSalesFils: number;

  clickSalesFils: number;
};

type ActiveShiftIndexRecord = {
  shiftId: string;
};

type ProductSaleRecord = {
  name: string;

  storePriceFils: number;

  isActive: boolean;

  showForEmployee: boolean;

  isDeleted?: boolean;
};

type SaleItemInput = {
  productId: string;

  quantity: number;
};

type SaleItemRecord = {
  productId: string;

  productNameSnapshot: string;

  quantity: number;

  unitPriceFils: number;

  lineTotalFils: number;
};

type PaymentMethod =
  | "CASH"
  | "CLICK";

export type DirectSaleResult = {
  saleId: string;

  totalFils: number;

  paymentMethod:
    PaymentMethod;

  createdAt: Date;
};

function mergeItems(
  items: SaleItemInput[],
) {
  const merged =
    new Map<
      string,
      number
    >();

  for (
    const item of items
  ) {
    const current =
      merged.get(
        item.productId,
      ) ?? 0;

    merged.set(
      item.productId,
      current +
        item.quantity,
    );
  }

  return Array.from(
    merged.entries(),
  ).map(
    ([
      productId,
      quantity,
    ]) => ({
      productId,
      quantity,
    }),
  );
}

export async function createDirectSale(input: {
  storeAuthUid: string;

  employeeId: string;

  employeeName: string;

  paymentMethod:
    PaymentMethod;

  items:
    SaleItemInput[];
}): Promise<DirectSaleResult> {
  const firestore =
    getFirebaseAdminFirestore();

  const mergedItems =
    mergeItems(
      input.items,
    );

  const activeShiftRef =
    firestore
      .collection(
        ACTIVE_STORE_SHIFTS_COLLECTION,
      )
      .doc(
        getActiveStoreShiftDocumentId(
          input.storeAuthUid,
        ),
      );

  const saleRef =
    firestore
      .collection(
        DIRECT_SALES_COLLECTION,
      )
      .doc();

  return firestore.runTransaction(
    async (
      transaction,
    ) => {
      const activeShiftSnapshot =
        await transaction.get(
          activeShiftRef,
        );

      if (
        !activeShiftSnapshot.exists
      ) {
        throw new NoActiveShiftError();
      }

      const activeShift =
        activeShiftSnapshot.data() as ActiveShiftIndexRecord;

      const shiftRef =
        firestore
          .collection(
            SHIFTS_COLLECTION,
          )
          .doc(
            activeShift.shiftId,
          );

      const shiftSnapshot =
        await transaction.get(
          shiftRef,
        );

      if (
        !shiftSnapshot.exists
      ) {
        throw new NoActiveShiftError();
      }

      const shift =
        shiftSnapshot.data() as ShiftRecord;

      if (
        shift.status !==
        SHIFT_STATUSES.OPEN
      ) {
        throw new NoActiveShiftError();
      }

      /*
       * أهم فحص:
       *
       * البيع لا يتم إلا إذا كان
       * الموظف الحالي هو صاحب الشفت.
       */
      if (
        shift.openedByEmployeeId !==
        input.employeeId
      ) {
        throw new NoActiveShiftError(
          `لا يمكنك البيع على هذا الشفت. الشفت الحالي مفتوح باسم ${shift.openedByEmployeeNameSnapshot}.`,
        );
      }

      const saleItems: SaleItemRecord[] =
        [];

      let totalFils =
        0;

      for (
        const item of
        mergedItems
      ) {
        const productRef =
          firestore
            .collection(
              PRODUCTS_COLLECTION,
            )
            .doc(
              item.productId,
            );

        const productSnapshot =
          await transaction.get(
            productRef,
          );

        if (
          !productSnapshot.exists
        ) {
          throw new ProductUnavailableError();
        }

        const product =
          productSnapshot.data() as ProductSaleRecord;

        if (
          product.isDeleted ||
          !product.isActive ||
          !product.showForEmployee
        ) {
          throw new ProductUnavailableError(
            product.name,
          );
        }

        const lineTotalFils =
          product.storePriceFils *
          item.quantity;

        totalFils +=
          lineTotalFils;

        saleItems.push({
          productId:
            productSnapshot.id,

          productNameSnapshot:
            product.name,

          quantity:
            item.quantity,

          unitPriceFils:
            product.storePriceFils,

          lineTotalFils,
        });
      }

      const now =
        Timestamp.now();

      /*
       * اسم وهوية منفذ البيع
       * تأتي من Operator Session
       * الموثوقة على السيرفر.
       */
      transaction.set(
        saleRef,
        {
          storeAuthUid:
            input.storeAuthUid,

          shiftId:
            shiftRef.id,

          employeeId:
            input.employeeId,

          employeeNameSnapshot:
            input.employeeName,

          items:
            saleItems,

          paymentMethod:
            input.paymentMethod,

          totalFils,

          createdAt:
            now,
        },
      );

      transaction.update(
        shiftRef,
        {
          saleCount:
            (shift.saleCount ??
              0) + 1,

          totalSalesFils:
            (shift.totalSalesFils ??
              0) +
            totalFils,

          cashSalesFils:
            (shift.cashSalesFils ??
              0) +
            (input.paymentMethod ===
            "CASH"
              ? totalFils
              : 0),

          clickSalesFils:
            (shift.clickSalesFils ??
              0) +
            (input.paymentMethod ===
            "CLICK"
              ? totalFils
              : 0),

          updatedAt:
            now,
        },
      );

      return {
        saleId:
          saleRef.id,

        totalFils,

        paymentMethod:
          input.paymentMethod,

        createdAt:
          now.toDate(),
      };
    },
  );
}