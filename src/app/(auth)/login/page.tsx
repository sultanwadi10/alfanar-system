import {
  redirect,
} from "next/navigation";

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

  if (
    requestedTarget ===
    "store"
  ) {
    if (!pairedDevice) {
      redirect("/");
    }

    target = "store";
  } else if (
    requestedTarget ===
    "admin"
  ) {
    if (pairedDevice) {
      redirect("/");
    }

    target = "admin";
  } else {
    target = pairedDevice
      ? "store"
      : "admin";
  }

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

  return (
    <LoginForm
      target={target}
    />
  );
}
