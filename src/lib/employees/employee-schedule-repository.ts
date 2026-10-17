import "server-only";

import { Timestamp } from "firebase-admin/firestore";

import { getFirebaseAdminFirestore } from "@/lib/firebase/admin";
import {
  EMPLOYEE_SHIFT_TYPES,
  EMPLOYEE_WEEKDAYS,
  type EmployeeSchedule,
  type EmployeeShiftTimeSettings,
  type EmployeeShiftType,
  type EmployeeWeekday,
} from "@/types/employee-schedule";

const EMPLOYEE_SCHEDULES_COLLECTION =
  "employeeSchedules";

const SYSTEM_SETTINGS_COLLECTION =
  "systemSettings";

const SHIFT_TIME_SETTINGS_DOCUMENT =
  "employeeShiftTimes";

const STORE_TIME_ZONE =
  "Asia/Amman";

/*
 * هاي فقط قيم التهيئة الأولى.
 *
 * أول ما النظام يقرأ الإعدادات لأول مرة،
 * يتم حفظها داخل Firestore.
 *
 * بعد ذلك Firestore هو مصدر الحقيقة،
 * والأدمن يستطيع تعديلها من الواجهة.
 */
const INITIAL_SHIFT_TIME_SETTINGS: EmployeeShiftTimeSettings =
  {
    morningStart: "08:00",
    morningEnd: "16:00",

    eveningStart: "16:00",
    eveningEnd: "00:00",
  };

type EmployeeScheduleRecord =
  EmployeeSchedule & {
    updatedAt: Timestamp;

    updatedByAuthUid:
      | string
      | null;
  };

type ShiftTimeSettingsRecord =
  EmployeeShiftTimeSettings & {
    updatedAt: Timestamp;

    updatedByAuthUid:
      | string
      | null;
  };

export type EmployeeCurrentScheduleAccess = {
  allowed: boolean;

  activeShifts:
    EmployeeShiftType[];
};

export function createEmptyEmployeeSchedule(): EmployeeSchedule {
  return {
    sunday: [],
    monday: [],
    tuesday: [],
    wednesday: [],
    thursday: [],
    friday: [],
    saturday: [],
  };
}

function toSafeSchedule(
  value:
    | Partial<EmployeeSchedule>
    | undefined,
): EmployeeSchedule {
  return {
    sunday:
      Array.isArray(
        value?.sunday,
      )
        ? value.sunday
        : [],

    monday:
      Array.isArray(
        value?.monday,
      )
        ? value.monday
        : [],

    tuesday:
      Array.isArray(
        value?.tuesday,
      )
        ? value.tuesday
        : [],

    wednesday:
      Array.isArray(
        value?.wednesday,
      )
        ? value.wednesday
        : [],

    thursday:
      Array.isArray(
        value?.thursday,
      )
        ? value.thursday
        : [],

    friday:
      Array.isArray(
        value?.friday,
      )
        ? value.friday
        : [],

    saturday:
      Array.isArray(
        value?.saturday,
      )
        ? value.saturday
        : [],
  };
}

export async function getEmployeeSchedule(
  employeeId: string,
): Promise<EmployeeSchedule> {
  const firestore =
    getFirebaseAdminFirestore();

  const snapshot =
    await firestore
      .collection(
        EMPLOYEE_SCHEDULES_COLLECTION,
      )
      .doc(employeeId)
      .get();

  if (!snapshot.exists) {
    return createEmptyEmployeeSchedule();
  }

  return toSafeSchedule(
    snapshot.data() as EmployeeScheduleRecord,
  );
}

export async function listEmployeeSchedules(
  employeeIds: string[],
): Promise<
  Record<
    string,
    EmployeeSchedule
  >
> {
  const entries =
    await Promise.all(
      employeeIds.map(
        async (
          employeeId,
        ) => {
          const schedule =
            await getEmployeeSchedule(
              employeeId,
            );

          return [
            employeeId,
            schedule,
          ] as const;
        },
      ),
    );

  return Object.fromEntries(
    entries,
  );
}

export async function saveEmployeeSchedule(
  employeeId: string,
  schedule: EmployeeSchedule,
  updatedByAuthUid: string,
): Promise<void> {
  const firestore =
    getFirebaseAdminFirestore();

  await firestore
    .collection(
      EMPLOYEE_SCHEDULES_COLLECTION,
    )
    .doc(employeeId)
    .set({
      ...schedule,

      updatedAt:
        Timestamp.now(),

      updatedByAuthUid,
    });
}

export async function getShiftTimeSettings(): Promise<EmployeeShiftTimeSettings> {
  const firestore =
    getFirebaseAdminFirestore();

  const reference =
    firestore
      .collection(
        SYSTEM_SETTINGS_COLLECTION,
      )
      .doc(
        SHIFT_TIME_SETTINGS_DOCUMENT,
      );

  const snapshot =
    await reference.get();

  if (snapshot.exists) {
    const record =
      snapshot.data() as ShiftTimeSettingsRecord;

    return {
      morningStart:
        record.morningStart,

      morningEnd:
        record.morningEnd,

      eveningStart:
        record.eveningStart,

      eveningEnd:
        record.eveningEnd,
    };
  }

  /*
   * إنشاء الإعدادات أول مرة فقط.
   */
  await reference.set({
    ...INITIAL_SHIFT_TIME_SETTINGS,

    updatedAt:
      Timestamp.now(),

    updatedByAuthUid:
      null,
  });

  return {
    ...INITIAL_SHIFT_TIME_SETTINGS,
  };
}

export async function saveShiftTimeSettings(
  settings: EmployeeShiftTimeSettings,
  updatedByAuthUid: string,
): Promise<void> {
  const firestore =
    getFirebaseAdminFirestore();

  await firestore
    .collection(
      SYSTEM_SETTINGS_COLLECTION,
    )
    .doc(
      SHIFT_TIME_SETTINGS_DOCUMENT,
    )
    .set({
      ...settings,

      updatedAt:
        Timestamp.now(),

      updatedByAuthUid,
    });
}

function timeToMinutes(
  value: string,
) {
  const [
    hourText,
    minuteText,
  ] =
    value.split(":");

  return (
    Number(hourText) *
      60 +
    Number(minuteText)
  );
}

function getLocalDayAndTime(
  date: Date,
): {
  weekday:
    EmployeeWeekday;

  minutes: number;
} {
  const formatter =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone:
          STORE_TIME_ZONE,

        weekday: "long",

        hour: "2-digit",

        minute: "2-digit",

        hourCycle: "h23",
      },
    );

  const parts =
    formatter.formatToParts(
      date,
    );

  const weekdayText =
    parts.find(
      (part) =>
        part.type ===
        "weekday",
    )?.value;

  const hourText =
    parts.find(
      (part) =>
        part.type ===
        "hour",
    )?.value;

  const minuteText =
    parts.find(
      (part) =>
        part.type ===
        "minute",
    )?.value;

  const weekdayMap: Record<
    string,
    EmployeeWeekday
  > = {
    Sunday:
      EMPLOYEE_WEEKDAYS.SUNDAY,

    Monday:
      EMPLOYEE_WEEKDAYS.MONDAY,

    Tuesday:
      EMPLOYEE_WEEKDAYS.TUESDAY,

    Wednesday:
      EMPLOYEE_WEEKDAYS.WEDNESDAY,

    Thursday:
      EMPLOYEE_WEEKDAYS.THURSDAY,

    Friday:
      EMPLOYEE_WEEKDAYS.FRIDAY,

    Saturday:
      EMPLOYEE_WEEKDAYS.SATURDAY,
  };

  const weekday =
    weekdayMap[
      weekdayText ?? ""
    ] ??
    EMPLOYEE_WEEKDAYS.SUNDAY;

  const hour =
    Number(
      hourText ?? "0",
    );

  const minute =
    Number(
      minuteText ?? "0",
    );

  return {
    weekday,

    minutes:
      hour * 60 +
      minute,
  };
}

function getPreviousWeekday(
  weekday:
    EmployeeWeekday,
): EmployeeWeekday {
  const days: EmployeeWeekday[] =
    [
      EMPLOYEE_WEEKDAYS.SUNDAY,
      EMPLOYEE_WEEKDAYS.MONDAY,
      EMPLOYEE_WEEKDAYS.TUESDAY,
      EMPLOYEE_WEEKDAYS.WEDNESDAY,
      EMPLOYEE_WEEKDAYS.THURSDAY,
      EMPLOYEE_WEEKDAYS.FRIDAY,
      EMPLOYEE_WEEKDAYS.SATURDAY,
    ];

  const index =
    days.indexOf(
      weekday,
    );

  return days[
    index === 0
      ? days.length - 1
      : index - 1
  ];
}

function isShiftActiveNow(input: {
  shift:
    EmployeeShiftType;

  currentWeekday:
    EmployeeWeekday;

  currentMinutes: number;

  schedule:
    EmployeeSchedule;

  startTime: string;

  endTime: string;
}) {
  const startMinutes =
    timeToMinutes(
      input.startTime,
    );

  const endMinutes =
    timeToMinutes(
      input.endTime,
    );

  if (
    startMinutes ===
    endMinutes
  ) {
    return false;
  }

  /*
   * شفت طبيعي بنفس اليوم:
   *
   * مثال:
   * 08:00 -> 16:00
   */
  if (
    endMinutes >
    startMinutes
  ) {
    return (
      input.schedule[
        input.currentWeekday
      ].includes(
        input.shift,
      ) &&
      input.currentMinutes >=
        startMinutes &&
      input.currentMinutes <
        endMinutes
    );
  }

  /*
   * شفت يعبر منتصف الليل:
   *
   * مثال:
   * 16:00 -> 00:00
   * أو مستقبلًا
   * 18:00 -> 02:00
   */
  if (
    input.schedule[
      input.currentWeekday
    ].includes(
      input.shift,
    ) &&
    input.currentMinutes >=
      startMinutes
  ) {
    return true;
  }

  const previousWeekday =
    getPreviousWeekday(
      input.currentWeekday,
    );

  return (
    input.schedule[
      previousWeekday
    ].includes(
      input.shift,
    ) &&
    input.currentMinutes <
      endMinutes
  );
}

export async function getEmployeeCurrentScheduleAccess(
  employeeId: string,
  now = new Date(),
): Promise<EmployeeCurrentScheduleAccess> {
  const [
    schedule,
    settings,
  ] =
    await Promise.all([
      getEmployeeSchedule(
        employeeId,
      ),

      getShiftTimeSettings(),
    ]);

  const {
    weekday,
    minutes,
  } =
    getLocalDayAndTime(
      now,
    );

  const activeShifts: EmployeeShiftType[] =
    [];

  const morningActive =
    isShiftActiveNow({
      shift:
        EMPLOYEE_SHIFT_TYPES.MORNING,

      currentWeekday:
        weekday,

      currentMinutes:
        minutes,

      schedule,

      startTime:
        settings.morningStart,

      endTime:
        settings.morningEnd,
    });

  if (morningActive) {
    activeShifts.push(
      EMPLOYEE_SHIFT_TYPES.MORNING,
    );
  }

  const eveningActive =
    isShiftActiveNow({
      shift:
        EMPLOYEE_SHIFT_TYPES.EVENING,

      currentWeekday:
        weekday,

      currentMinutes:
        minutes,

      schedule,

      startTime:
        settings.eveningStart,

      endTime:
        settings.eveningEnd,
    });

  if (eveningActive) {
    activeShifts.push(
      EMPLOYEE_SHIFT_TYPES.EVENING,
    );
  }

  return {
    allowed:
      activeShifts.length >
      0,

    activeShifts,
  };
}