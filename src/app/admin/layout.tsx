import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin/admin-shell";
import { getAdminSecurityContext } from "@/lib/security/get-admin-security-context";
import { isSecurityError } from "@/lib/security/is-security-error";

type AdminLayoutProps = {
  children: ReactNode;
};

export default async function AdminLayout({
  children,
}: AdminLayoutProps) {
  try {
    await getAdminSecurityContext();
  } catch (error) {
    if (isSecurityError(error)) {
      redirect("/login");
    }

    throw error;
  }

  return (
    <AdminShell>
      {children}
    </AdminShell>
  );
}