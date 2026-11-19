import { currentRosterContext } from "@/lib/employees/roster-repository";
import { suggestShiftType } from "./shift-selection";
import { cashCount } from "./cash-count";
import { prepareDailyWage } from "./daily-wage-repository";
import { OPERATOR_SESSION_CUTOFFS, operatorSessionCutoffId } from "@/lib/auth/operator-session-cutoff";
import "server-only";

import { createHash } from "node:crypto";

import { Timestamp } from "firebase-admin/firestore";

import { settleShiftCash, shiftTimeSnapshot, validWage } from "@/lib/shifts/shift-payroll";

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
  shiftTypeSource?: "MANUAL" | "AUTO_SCHEDULE" | "AUTO_HANDOVER" | "AUTO_CLOCK";
  banknotesFils?: number | null;
  coinsFils?: number | null;
  wageFilsSnapshot?: number | null;
  wageWorkDay?:string;
  wageSettlement?:"PAID"|"ALREADY_PAID"|"UNCONFIGURED";
  dailyWageReceiptId?:string|null;
  wagePaidFils?: number;
  expectedHandoverFils?: number;
  payrollVersion?: number;
  shiftTimeSnapshot?: ReturnType<typeof shiftTimeSnapshot>;
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
    // A read must not delete an index that another request may have replaced.
    // startShift transactionally replaces stale indices when opening a shift.
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

  return toActiveShift(
    shiftSnapshot.id,
    shift,
  );
}

async function openingContext(tx:FirebaseFirestore.Transaction,db:FirebaseFirestore.Firestore,at:Date,employeeId:string,storeAuthUid:string){
  const [roster,history]=await Promise.all([currentRosterContext(tx,db,at,employeeId),tx.get(db.collection(SHIFTS_COLLECTION).orderBy("openedAt","desc").limit(60))]);
  const previous=history.docs.map(d=>d.data()).find(d=>d.storeAuthUid===storeAuthUid&&d.status==="CLOSED"&&d.closedAt instanceof Timestamp&&["MORNING","EVENING"].includes(d.shiftTimeSnapshot?.shiftType));
  const suggestion=suggestShiftType(at,roster.settings,roster.schedule,previous?{type:previous.shiftTimeSnapshot.shiftType,workDay:previous.shiftTimeSnapshot.workDay,closedAt:previous.closedAt.toDate()}:undefined);
  return {...roster,suggestion};
}
export async function getShiftOpeningSuggestion(employeeId:string,storeAuthUid:string){const db=getFirebaseAdminFirestore();return db.runTransaction(async tx=>(await openingContext(tx,db,new Date(),employeeId,storeAuthUid)).suggestion.type);}

export async function startShift(input: {
  shiftType?: "MORNING" | "EVENING";
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

      // Snapshot admin-only terms in the same transaction as opening the shift.
      const wageDocument = await transaction.get(firestore.collection("systemSettings").doc("employeeWage"));
      const {settings:times,suggestion} = await openingContext(transaction, firestore, now.toDate(),input.employeeId,input.storeAuthUid);
      const wage = wageDocument.exists ? wageDocument.data()?.dailyWageFils : null;
      if (wage !== null && !validWage(wage)) throw Error("Invalid wage configuration");

      const record: ShiftRecord =
        {
          wageFilsSnapshot: wage,
          payrollVersion: 2,
          shiftTimeSnapshot: shiftTimeSnapshot(now.toDate(), times, input.shiftType??suggestion.type),
          shiftTypeSource:input.shiftType?"MANUAL":suggestion.source,

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
  storeAuthUid: string; employeeId: string; employeeName: string; actualCashFils: number; banknotesFils?: number; coinsFils?: number; shiftId: string;
}): Promise<ClosedShiftSummary | null> {
  const counted = cashCount(input);
  const firestore = getFirebaseAdminFirestore();
  const indexRef = firestore.collection(ACTIVE_STORE_SHIFTS_COLLECTION).doc(getActiveStoreShiftDocumentId(input.storeAuthUid));
  const shiftRef = firestore.collection(SHIFTS_COLLECTION).doc(input.shiftId);
  return firestore.runTransaction(async transaction => {
    const shiftSnapshot = await transaction.get(shiftRef);
    if (!shiftSnapshot.exists) return null;
    const shift = shiftSnapshot.data() as ShiftRecord;
    if (shift.storeAuthUid !== input.storeAuthUid || shift.openedByEmployeeId !== input.employeeId) return null;
    // Retrying the original handover cannot close a later shift or charge its wage twice.
    if (shift.status === SHIFT_STATUSES.CLOSED) {
      if (shift.closedByEmployeeId !== input.employeeId || shift.actualCashFils === null || shift.differenceFils === null) return null;
      if (shift.actualCashFils !== counted.actualCashFils || (counted.banknotesFils !== null && (shift.banknotesFils !== counted.banknotesFils || shift.coinsFils !== counted.coinsFils))) return null;
      return { shiftId: shiftRef.id, expectedCashFils: shift.expectedHandoverFils ?? shift.cashSalesFils, actualCashFils: shift.actualCashFils, differenceFils: shift.differenceFils };
    }
    if (shift.status !== SHIFT_STATUSES.OPEN) return null;
    const indexSnapshot = await transaction.get(indexRef);
    if (!indexSnapshot.exists || indexSnapshot.data()?.shiftId !== input.shiftId) return null;
    const now = Timestamp.now();
    const wage=await prepareDailyWage(transaction,firestore,shift,input,now);
    const wagePaidFils=wage.paidFils;
    const { expectedCashFils, differenceFils } = settleShiftCash(shift.cashSalesFils,wagePaidFils,input.actualCashFils);
    wage.commit();
    transaction.update(shiftRef, {
      status: SHIFT_STATUSES.CLOSED, closedByEmployeeId: input.employeeId,
      closedByEmployeeNameSnapshot: input.employeeName, closedAt: now,
      ...counted, differenceFils, wagePaidFils,
      payrollVersion:2,wageWorkDay:wage.workDay,wageSettlement:wage.status,dailyWageReceiptId:wage.receiptId,
      expectedHandoverFils: expectedCashFils, updatedAt: now,
    });
    transaction.set(firestore.collection(OPERATOR_SESSION_CUTOFFS).doc(operatorSessionCutoffId(input.storeAuthUid,input.employeeId)), { invalidBefore: now, shiftId:input.shiftId, storeAuthUid:input.storeAuthUid, employeeId:input.employeeId });
    transaction.delete(indexRef);
    return { shiftId: shiftRef.id, expectedCashFils, actualCashFils: input.actualCashFils, differenceFils };
  });
}
