import "server-only";

import { Timestamp } from "firebase-admin/firestore";

import { getFirebaseAdminFirestore } from "@/lib/firebase/admin";
import type {
  Employee,
  EmployeeRecord,
} from "@/types/employee";

const EMPLOYEES_COLLECTION = "employees";

type CreateEmployeeRecordInput = {
  name: string;
  pinHash: string;
};

function toEmployee(
  id: string,
  record: EmployeeRecord,
): Employee {
  return {
    id,
    name: record.name,
    isActive: record.isActive,
    createdAt: record.createdAt.toDate(),
    updatedAt: record.updatedAt.toDate(),
  };
}

export async function createEmployeeRecord(
  input: CreateEmployeeRecordInput,
): Promise<Employee> {
  const firestore =
    getFirebaseAdminFirestore();

  const employeeRef = firestore
    .collection(EMPLOYEES_COLLECTION)
    .doc();

  const now = Timestamp.now();

  const record: EmployeeRecord = {
    name: input.name,
    isActive: true,
    pinHash: input.pinHash,
    createdAt: now,
    updatedAt: now,
  };

  await employeeRef.set(record);

  return toEmployee(
    employeeRef.id,
    record,
  );
}

export async function listEmployees(): Promise<Employee[]> {
  const firestore =
    getFirebaseAdminFirestore();

  const snapshot = await firestore
    .collection(EMPLOYEES_COLLECTION)
    .orderBy("createdAt", "desc")
    .get();

  return snapshot.docs.map((document) => {
    const record =
      document.data() as EmployeeRecord;

    return toEmployee(
      document.id,
      record,
    );
  });
}

export async function updateEmployeeActiveStatus(
  employeeId: string,
  isActive: boolean,
): Promise<boolean> {
  const firestore =
    getFirebaseAdminFirestore();

  const employeeRef = firestore
    .collection(EMPLOYEES_COLLECTION)
    .doc(employeeId);

  const snapshot =
    await employeeRef.get();

  if (!snapshot.exists) {
    return false;
  }

  await employeeRef.update({
    isActive,
    updatedAt: Timestamp.now(),
  });

  return true;
}

export async function updateEmployeePinHash(
  employeeId: string,
  pinHash: string,
): Promise<boolean> {
  const firestore =
    getFirebaseAdminFirestore();

  const employeeRef = firestore
    .collection(EMPLOYEES_COLLECTION)
    .doc(employeeId);

  const snapshot =
    await employeeRef.get();

  if (!snapshot.exists) {
    return false;
  }

  await employeeRef.update({
    pinHash,
    updatedAt: Timestamp.now(),
  });

  return true;
}