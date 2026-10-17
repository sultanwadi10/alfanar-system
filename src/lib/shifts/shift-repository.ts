import "server-only";

import { createHash } from "node:crypto";

import { Timestamp } from "firebase-admin/firestore";

import { getFirebaseAdminFirestore } from "@/lib/firebase/admin";

const SHIFTS_COLLECTION =
  "shifts";

export const ACTIVE_STORE_SHIFTS_COLLECTION =
  "activeStoreShifts";

export const SHIFT_STATUSES = {
  OPEN: "OPEN",
  CLOSED: "CLOSED",
} as const;

type ShiftStatus =
  (typeof SHIFT_STATUSES)[keyof typeof SHIFT_STATUSES];

type ShiftRecord = {
  storeAuthUid: string;

  status: ShiftStatus;

  openedByEmployeeId: string;

  openedByEmployeeNameSnapshot: string;

  openedAt: Timestamp;

  closedByEmployeeId:
    | string
    | null;

  closedByEmployeeNameSnapshot:
    | string
    | null;

  closedAt:
    | Timestamp
    | null;

  saleCount: number;

  totalSalesFils: number;

  cashSalesFils: number;

  clickSalesFils: number;

  actualCashFils:
    | number
    | null;

  differenceFils:
    | number
    | null;

  createdAt: Timestamp;

  updatedAt: Timestamp;
};

type ActiveStoreShiftRecord = {
  shiftId: string;
  openedAt: Timestamp;
};

export type ActiveShift = {
  id: string;

  openedAt: Date;

  openedByEmployeeId: string;

  openedByEmployeeName: string;
};

export type ShiftClosePreview = {
  shiftId: string;

  expectedCashFils: number;

  saleCount: number;
};

export type ClosedShiftSummary = {
  shiftId: string;

  expectedCashFils: number;

  actualCashFils: number;

  differenceFils: number;
};

export class ShiftOwnedByAnotherEmployeeError extends Error {
  employeeId: string;

  employeeName: string;

  constructor(
    employeeId: string,
    employeeName: string,
  ) {
    super(
      `يوجد شفت مفتوح حاليًا باسم ${employeeName}. يجب إنهاء الشفت الحالي قبل بدء شفت موظف آخر.`,
    );

    this.name =
      "ShiftOwnedByAnotherEmployeeError";

    this.employeeId =
      employeeId;

    this.employeeName =
      employeeName;
  }
}

export function getActiveStoreShiftDocumentId(
  storeAuthUid: string,
) {
  return createHash(
    "sha256",
  )
    .update(storeAuthUid)
    .digest("hex");
}

function toActiveShift(
  shiftId: string,
  record: ShiftRecord,
): ActiveShift {
  return {
    id:
      shiftId,

    openedAt:
      record.openedAt.toDate(),

    openedByEmployeeId:
      record.openedByEmployeeId,

    openedByEmployeeName:
      record.openedByEmployeeNameSnapshot,
  };
}

export async function getActiveShift(
  storeAuthUid: string,
): Promise<ActiveShift | null> {
  const firestore =
    getFirebaseAdminFirestore();

  const indexRef =
    firestore
      .collection(
        ACTIVE_STORE_SHIFTS_COLLECTION,
      )
      .doc(
        getActiveStoreShiftDocumentId(
          storeAuthUid,
        ),
      );

  const indexSnapshot =
    await indexRef.get();

  if (!indexSnapshot.exists) {
    return null;
  }

  const index =
    indexSnapshot.data() as ActiveStoreShiftRecord;

  const shiftRef =
    firestore
      .collection(
        SHIFTS_COLLECTION,
      )
      .doc(
        index.shiftId,
      );

  const shiftSnapshot =
    await shiftRef.get();

  if (!shiftSnapshot.exists) {
    await indexRef.delete();

    return null;
  }

  const shift =
    shiftSnapshot.data() as ShiftRecord;

  if (
    shift.status !==
    SHIFT_STATUSES.OPEN
  ) {
    await indexRef.delete();

    return null;
  }

  return toActiveShift(
    shiftSnapshot.id,
    shift,
  );
}

export async function startShift(input: {
  storeAuthUid: string;

  employeeId: string;

  employeeName: string;
}): Promise<ActiveShift> {
  const firestore =
    getFirebaseAdminFirestore();

  const indexRef =
    firestore
      .collection(
        ACTIVE_STORE_SHIFTS_COLLECTION,
      )
      .doc(
        getActiveStoreShiftDocumentId(
          input.storeAuthUid,
        ),
      );

  return firestore.runTransaction(
    async (transaction) => {
      const indexSnapshot =
        await transaction.get(
          indexRef,
        );

      if (indexSnapshot.exists) {
        const index =
          indexSnapshot.data() as ActiveStoreShiftRecord;

        const existingShiftRef =
          firestore
            .collection(
              SHIFTS_COLLECTION,
            )
            .doc(
              index.shiftId,
            );

        const existingShiftSnapshot =
          await transaction.get(
            existingShiftRef,
          );

        if (
          existingShiftSnapshot.exists
        ) {
          const existingShift =
            existingShiftSnapshot.data() as ShiftRecord;

          if (
            existingShift.status ===
            SHIFT_STATUSES.OPEN
          ) {
            /*
             * نفس الموظف:
             * نسمح له بإكمال شفته الحالي.
             */
            if (
              existingShift.openedByEmployeeId ===
              input.employeeId
            ) {
              return toActiveShift(
                existingShiftSnapshot.id,
                existingShift,
              );
            }

            /*
             * موظف مختلف:
             * ممنوع يرث شفت موظف ثاني.
             */
            throw new ShiftOwnedByAnotherEmployeeError(
              existingShift.openedByEmployeeId,
              existingShift.openedByEmployeeNameSnapshot,
            );
          }
        }
      }

      const shiftRef =
        firestore
          .collection(
            SHIFTS_COLLECTION,
          )
          .doc();

      const now =
        Timestamp.now();

      const record: ShiftRecord =
        {
          storeAuthUid:
            input.storeAuthUid,

          status:
            SHIFT_STATUSES.OPEN,

          openedByEmployeeId:
            input.employeeId,

          openedByEmployeeNameSnapshot:
            input.employeeName,

          openedAt:
            now,

          closedByEmployeeId:
            null,

          closedByEmployeeNameSnapshot:
            null,

          closedAt:
            null,

          saleCount:
            0,

          totalSalesFils:
            0,

          cashSalesFils:
            0,

          clickSalesFils:
            0,

          actualCashFils:
            null,

          differenceFils:
            null,

          createdAt:
            now,

          updatedAt:
            now,
        };

      const activeRecord: ActiveStoreShiftRecord =
        {
          shiftId:
            shiftRef.id,

          openedAt:
            now,
        };

      transaction.set(
        shiftRef,
        record,
      );

      transaction.set(
        indexRef,
        activeRecord,
      );

      return toActiveShift(
        shiftRef.id,
        record,
      );
    },
  );
}

export async function getShiftClosePreview(
  storeAuthUid: string,
): Promise<ShiftClosePreview | null> {
  const firestore =
    getFirebaseAdminFirestore();

  const indexRef =
    firestore
      .collection(
        ACTIVE_STORE_SHIFTS_COLLECTION,
      )
      .doc(
        getActiveStoreShiftDocumentId(
          storeAuthUid,
        ),
      );

  const indexSnapshot =
    await indexRef.get();

  if (!indexSnapshot.exists) {
    return null;
  }

  const index =
    indexSnapshot.data() as ActiveStoreShiftRecord;

  const shiftSnapshot =
    await firestore
      .collection(
        SHIFTS_COLLECTION,
      )
      .doc(
        index.shiftId,
      )
      .get();

  if (!shiftSnapshot.exists) {
    return null;
  }

  const shift =
    shiftSnapshot.data() as ShiftRecord;

  if (
    shift.status !==
    SHIFT_STATUSES.OPEN
  ) {
    return null;
  }

  return {
    shiftId:
      shiftSnapshot.id,

    expectedCashFils:
      shift.cashSalesFils,

    saleCount:
      shift.saleCount,
  };
}

export async function closeShift(input: {
  storeAuthUid: string;

  employeeId: string;

  employeeName: string;

  actualCashFils: number;
}): Promise<ClosedShiftSummary | null> {
  const firestore =
    getFirebaseAdminFirestore();

  const indexRef =
    firestore
      .collection(
        ACTIVE_STORE_SHIFTS_COLLECTION,
      )
      .doc(
        getActiveStoreShiftDocumentId(
          input.storeAuthUid,
        ),
      );

  return firestore.runTransaction(
    async (transaction) => {
      const indexSnapshot =
        await transaction.get(
          indexRef,
        );

      if (!indexSnapshot.exists) {
        return null;
      }

      const index =
        indexSnapshot.data() as ActiveStoreShiftRecord;

      const shiftRef =
        firestore
          .collection(
            SHIFTS_COLLECTION,
          )
          .doc(
            index.shiftId,
          );

      const shiftSnapshot =
        await transaction.get(
          shiftRef,
        );

      if (!shiftSnapshot.exists) {
        return null;
      }

      const shift =
        shiftSnapshot.data() as ShiftRecord;

      if (
        shift.status !==
        SHIFT_STATUSES.OPEN
      ) {
        return null;
      }

      /*
       * لا يستطيع موظف إنهاء شفت موظف آخر.
       */
      if (
        shift.openedByEmployeeId !==
        input.employeeId
      ) {
        return null;
      }

      const expectedCashFils =
        shift.cashSalesFils;

      const differenceFils =
        input.actualCashFils -
        expectedCashFils;

      const now =
        Timestamp.now();

      transaction.update(
        shiftRef,
        {
          status:
            SHIFT_STATUSES.CLOSED,

          closedByEmployeeId:
            input.employeeId,

          closedByEmployeeNameSnapshot:
            input.employeeName,

          closedAt:
            now,

          actualCashFils:
            input.actualCashFils,

          differenceFils,

          updatedAt:
            now,
        },
      );

      transaction.delete(
        indexRef,
      );

      return {
        shiftId:
          shiftRef.id,

        expectedCashFils,

        actualCashFils:
          input.actualCashFils,

        differenceFils,
      };
    },
  );
}