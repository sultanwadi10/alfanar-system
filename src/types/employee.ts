import type { Timestamp } from "firebase-admin/firestore";

export type Employee = {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type EmployeeRecord = {
  name: string;
  isActive: boolean;
  pinHash: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};