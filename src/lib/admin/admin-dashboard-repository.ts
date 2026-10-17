import "server-only";

import { Timestamp } from "firebase-admin/firestore";

import { getFirebaseAdminFirestore } from "@/lib/firebase/admin";

const DIRECT_SALES_COLLECTION =
  "directSales";

const SHIFTS_COLLECTION =
  "shifts";

const ACTIVE_STORE_SHIFTS_COLLECTION =
  "activeStoreShifts";

const STORE_TIME_ZONE =
  "Asia/Amman";

type DirectSaleItemRecord = {
  productId: string;

  productNameSnapshot: string;

  quantity: number;

  unitPriceFils: number;

  lineTotalFils: number;
};

type DirectSaleRecord = {
  shiftId: string;

  employeeId: string;

  employeeNameSnapshot: string;

  items: DirectSaleItemRecord[];

  paymentMethod:
    | "CASH"
    | "CLICK";

  totalFils: number;

  createdAt: Timestamp;
};

type ActiveShiftIndexRecord = {
  shiftId: string;
};

type ShiftRecord = {
  status: "OPEN" | "CLOSED";

  openedByEmployeeId: string;

  openedByEmployeeNameSnapshot: string;

  openedAt: Timestamp;

  saleCount: number;

  totalSalesFils: number;

  cashSalesFils: number;

  clickSalesFils: number;
};

export type AdminDashboardTopProduct = {
  name: string;

  quantity: number;

  percentage: number;
};

export type AdminDashboardRecentSale = {
  id: string;

  employeeName: string;

  paymentMethod:
    | "CASH"
    | "CLICK";

  totalFils: number;

  createdAt: Date;
};

export type AdminDashboardCurrentShift = {
  id: string;

  employeeName: string;

  openedAt: Date;

  saleCount: number;

  totalSalesFils: number;

  cashSalesFils: number;

  clickSalesFils: number;
};

export type AdminDashboardData = {
  todaySalesFils: number;

  todaySaleCount: number;

  todayCashFils: number;

  todayClickFils: number;

  todayCouponFils: number;

  chartBars: number[];

  topProducts:
    AdminDashboardTopProduct[];

  recentSales:
    AdminDashboardRecentSale[];

  currentShift:
    AdminDashboardCurrentShift | null;
};

function getJordanDateParts(
  date: Date,
) {
  const parts =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone:
          STORE_TIME_ZONE,

        year: "numeric",

        month: "2-digit",

        day: "2-digit",
      },
    ).formatToParts(date);

  const getPart = (
    type: string,
  ) =>
    parts.find(
      (part) =>
        part.type === type,
    )?.value ?? "";

  return {
    year:
      getPart("year"),

    month:
      getPart("month"),

    day:
      getPart("day"),
  };
}

function getTodayRange() {
  const now =
    new Date();

  const {
    year,
    month,
    day,
  } =
    getJordanDateParts(
      now,
    );

  /*
   * محطة الفنار تعمل حسب توقيت الأردن.
   * الأردن يعمل حاليًا على UTC+3.
   */
  const start =
    new Date(
      `${year}-${month}-${day}T00:00:00+03:00`,
    );

  const end =
    new Date(
      start.getTime() +
        24 *
          60 *
          60 *
          1000,
    );

  return {
    start,
    end,
  };
}

function getJordanHour(
  date: Date,
) {
  const hourText =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone:
          STORE_TIME_ZONE,

        hour: "2-digit",

        hourCycle: "h23",
      },
    ).format(date);

  const hour =
    Number(hourText);

  if (
    !Number.isInteger(
      hour,
    ) ||
    hour < 0 ||
    hour > 23
  ) {
    return 0;
  }

  return hour;
}

async function getCurrentShift(): Promise<
  AdminDashboardCurrentShift | null
> {
  const firestore =
    getFirebaseAdminFirestore();

  const activeSnapshot =
    await firestore
      .collection(
        ACTIVE_STORE_SHIFTS_COLLECTION,
      )
      .limit(1)
      .get();

  if (activeSnapshot.empty) {
    return null;
  }

  const activeRecord =
    activeSnapshot.docs[0]
      .data() as ActiveShiftIndexRecord;

  if (
    !activeRecord.shiftId
  ) {
    return null;
  }

  const shiftSnapshot =
    await firestore
      .collection(
        SHIFTS_COLLECTION,
      )
      .doc(
        activeRecord.shiftId,
      )
      .get();

  if (!shiftSnapshot.exists) {
    return null;
  }

  const shift =
    shiftSnapshot.data() as ShiftRecord;

  if (
    shift.status !==
    "OPEN"
  ) {
    return null;
  }

  return {
    id:
      shiftSnapshot.id,

    employeeName:
      shift.openedByEmployeeNameSnapshot,

    openedAt:
      shift.openedAt.toDate(),

    saleCount:
      shift.saleCount ?? 0,

    totalSalesFils:
      shift.totalSalesFils ??
      0,

    cashSalesFils:
      shift.cashSalesFils ??
      0,

    clickSalesFils:
      shift.clickSalesFils ??
      0,
  };
}

export async function getAdminDashboardData(): Promise<AdminDashboardData> {
  const firestore =
    getFirebaseAdminFirestore();

  const {
    start,
    end,
  } =
    getTodayRange();

  const salesSnapshot =
    await firestore
      .collection(
        DIRECT_SALES_COLLECTION,
      )
      .where(
        "createdAt",
        ">=",
        Timestamp.fromDate(
          start,
        ),
      )
      .where(
        "createdAt",
        "<",
        Timestamp.fromDate(
          end,
        ),
      )
      .orderBy(
        "createdAt",
        "asc",
      )
      .get();

  let todaySalesFils =
    0;

  let todayCashFils =
    0;

  let todayClickFils =
    0;

  const productQuantities =
    new Map<
      string,
      {
        name: string;
        quantity: number;
      }
    >();

  const hourlySales =
    Array.from(
      {
        length: 12,
      },
      () => 0,
    );

  const recentSales: AdminDashboardRecentSale[] =
    [];

  for (
    const document of
    salesSnapshot.docs
  ) {
    const sale =
      document.data() as DirectSaleRecord;

    const totalFils =
      sale.totalFils ??
      0;

    todaySalesFils +=
      totalFils;

    if (
      sale.paymentMethod ===
      "CASH"
    ) {
      todayCashFils +=
        totalFils;
    }

    if (
      sale.paymentMethod ===
      "CLICK"
    ) {
      todayClickFils +=
        totalFils;
    }

    const createdAt =
      sale.createdAt.toDate();

    const hour =
      getJordanHour(
        createdAt,
      );

    const bucket =
      Math.min(
        11,
        Math.floor(
          hour / 2,
        ),
      );

    hourlySales[
      bucket
    ] += totalFils;

    if (
      Array.isArray(
        sale.items,
      )
    ) {
      for (
        const item of
        sale.items
      ) {
        const current =
          productQuantities.get(
            item.productId,
          );

        if (current) {
          current.quantity +=
            item.quantity;

          continue;
        }

        productQuantities.set(
          item.productId,
          {
            name:
              item.productNameSnapshot,

            quantity:
              item.quantity,
          },
        );
      }
    }

    recentSales.push({
      id:
        document.id,

      employeeName:
        sale.employeeNameSnapshot,

      paymentMethod:
        sale.paymentMethod,

      totalFils,

      createdAt,
    });
  }

  recentSales.sort(
    (first, second) =>
      second.createdAt.getTime() -
      first.createdAt.getTime(),
  );

  const sortedProducts =
    Array.from(
      productQuantities.values(),
    ).sort(
      (
        first,
        second,
      ) =>
        second.quantity -
        first.quantity,
    );

  const maximumQuantity =
    sortedProducts[0]
      ?.quantity ?? 0;

  const topProducts =
    sortedProducts
      .slice(0, 5)
      .map(
        (product) => ({
          name:
            product.name,

          quantity:
            product.quantity,

          percentage:
            maximumQuantity > 0
              ? Math.round(
                  (product.quantity /
                    maximumQuantity) *
                    100,
                )
              : 0,
        }),
      );

  const maximumHourlySales =
    Math.max(
      ...hourlySales,
      0,
    );

  const chartBars =
    hourlySales.map(
      (value) => {
        if (
          value <= 0 ||
          maximumHourlySales <=
            0
        ) {
          return 0;
        }

        return Math.max(
          8,
          Math.round(
            (value /
              maximumHourlySales) *
              100,
          ),
        );
      },
    );

  const currentShift =
    await getCurrentShift();

  return {
    todaySalesFils,

    todaySaleCount:
      salesSnapshot.size,

    todayCashFils,

    todayClickFils,

    todayCouponFils:
      0,

    chartBars,

    topProducts,

    recentSales:
      recentSales.slice(
        0,
        5,
      ),

    currentShift,
  };
}