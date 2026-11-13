import "server-only";
import { Timestamp } from "firebase-admin/firestore";
import { getFirebaseAdminFirestore } from "@/lib/firebase/admin";
import { validWage } from "@/lib/shifts/shift-payroll";

export async function getWageSettings(): Promise<{ dailyWageFils: number | null }> {
  const record = (await getFirebaseAdminFirestore().collection("systemSettings").doc("employeeWage").get()).data();
  if (record && !validWage(record.dailyWageFils)) throw Error("Invalid wage settings");
  return { dailyWageFils: record?.dailyWageFils ?? null };
}
export async function saveWageSettings(dailyWageFils: number, authUid: string) {
  if (!validWage(dailyWageFils)) throw Error("Invalid wage settings");
  await getFirebaseAdminFirestore().collection("systemSettings").doc("employeeWage").set({ dailyWageFils, updatedAt: Timestamp.now(), updatedByAuthUid: authUid });
}
