"use client";
import { createContext, useContext, type Dispatch, type SetStateAction } from "react";
import type { DashboardStatus } from "@/types/admin-overview";
export const AdminOverviewContext = createContext<{ status: DashboardStatus | null; setStatus: Dispatch<SetStateAction<DashboardStatus | null>> } | null>(null);
export function useAdminOverview() { return useContext(AdminOverviewContext); }
