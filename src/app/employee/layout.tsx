import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { getStoreSecurityContext } from "@/lib/security/get-store-security-context";
import { isSecurityError } from "@/lib/security/is-security-error";

type EmployeeLayoutProps = {
  children: ReactNode;
};

export default async function EmployeeLayout({
  children,
}: EmployeeLayoutProps) {
  try {
    await getStoreSecurityContext();
  } catch (error) {
    if (isSecurityError(error)) {
      redirect("/login");
    }

    throw error;
  }

  return children;
}