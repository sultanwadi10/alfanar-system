
import {
  redirect,
} from "next/navigation";

import {
  hasCurrentAdminStealthAccess,
} from "@/lib/admin/admin-stealth-access";
import {
  resolvePairedStoreDevice,
} from "@/lib/store/store-device-repository";
import {
  isStoreStealthAccessAllowed,
  resolveCurrentStoreStealthAccess,
} from "@/lib/store/store-stealth-access";
import {
  getStoreRuntimeState,
  STORE_RUNTIME_STATUSES,
} from "@/lib/store/store-runtime-repository";

import {
  LoginForm,
} from "./login-form";

type LoginTarget =
  | "admin"
  | "store";

type LoginPageProps = {
  searchParams:
    Promise<{
      target?:
        string |
        string[];
    }>;
};

export default async function LoginPage({
  searchParams,
}: LoginPageProps) {
  const params =
    await searchParams;

  const requestedTarget =
    Array.isArray(
      params.target,
    )
      ? params.target[0]
      : params.target;

  const pairedDevice =
    await resolvePairedStoreDevice()
      .catch(
        () => null,
      );

  let target:
    LoginTarget;

  // Determine the requested login type.
  if (
    requestedTarget ===
    "store"
  ) {
    // Store access requires a paired device.
    if (!pairedDevice) {
      redirect("/");
    }

    target = "store";
  } else if (
    requestedTarget ===
    "admin"
  ) {
    // Admin access is allowed from any device,
    // including a paired store device.
    // The secret grant is checked below.
    target = "admin";
  } else {
    // Preserve the existing default behavior.
    target = pairedDevice
      ? "store"
      : "admin";
  }

  // Store login security checks.
  if (
    target === "store"
  ) {
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

    const stealthAccess =
      await resolveCurrentStoreStealthAccess()
        .catch(
          () => null,
        );

    if (
      !stealthAccess ||
      !isStoreStealthAccessAllowed(
        stealthAccess,
        runtime,
      )
    ) {
      redirect("/");
    }
  }

  // Admin login security checks.
  if (
    target === "admin"
  ) {
    const hasAccess =
      await hasCurrentAdminStealthAccess()
        .catch(
          () => false,
        );

    if (!hasAccess) {
      redirect("/");
    }
  }

  return (
    <LoginForm
      target={target}
    />
  );
}
