import type {
  ReactNode,
} from "react";
import {
  redirect,
} from "next/navigation";

import {
  StoreRuntimeWatch,
} from "@/components/store/store-runtime-watch";
import {
  getStoreSecurityContext,
} from "@/lib/security/get-store-security-context";
import {
  isSecurityError,
} from "@/lib/security/is-security-error";
import {
  resolvePairedStoreDevice,
} from "@/lib/store/store-device-repository";
import {
  getStoreRuntimeState,
  STORE_RUNTIME_STATUSES,
} from "@/lib/store/store-runtime-repository";

type EmployeeLayoutProps = {
  children:
    ReactNode;
};

export default async function EmployeeLayout({
  children,
}: EmployeeLayoutProps) {
  const device =
    await resolvePairedStoreDevice()
      .catch(
        () => null,
      );

  if (!device) {
    redirect("/");
  }

  const runtime =
    await getStoreRuntimeState()
      .catch(
        () => null,
      );

  if (
    !runtime ||
    runtime.status ===
      STORE_RUNTIME_STATUSES.STOPPED
  ) {
    redirect("/");
  }

  try {
    await getStoreSecurityContext();
  } catch (error) {
    if (
      isSecurityError(
        error,
      )
    ) {
      redirect(
        "/login?target=store",
      );
    }

    throw error;
  }

  return (
    <StoreRuntimeWatch>
      {children}
    </StoreRuntimeWatch>
  );
}
