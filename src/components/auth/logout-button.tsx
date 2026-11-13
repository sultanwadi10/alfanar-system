"use client";
import { userMessage } from "@/lib/client/user-message";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

type LogoutTarget = "admin" | "store";

type LogoutButtonProps = {
  target: LogoutTarget;
  label?: ReactNode;
  className?: string;
};

export function LogoutButton({
  target, label, className,
}: LogoutButtonProps) {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleLogout() {
    setLoading(true);
    setErrorMessage("");

    try {
      const endpoint =
        target === "admin"
          ? "/api/auth/session/admin/logout"
          : "/api/auth/session/store/logout";

      const response = await fetch(endpoint, {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok || data.success !== true) {
        setErrorMessage(
          userMessage(data?.error?.message ?? "Logout failed."),
        );

        return;
      }

      if (target === "admin") {
  window.location.replace("/");
  return;
}

router.replace("/login");
router.refresh();
    } catch (error) {
      setErrorMessage(
        userMessage(error instanceof Error
          ? error.message
          : "Unexpected logout error."),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        className={className}
        onClick={handleLogout}
        disabled={loading}
      >
        {loading ? (label ? "جارٍ الخروج…" : "Signing out...") : label ?? "Logout"}
      </button>

      {errorMessage && (
        <p>{errorMessage}</p>
      )}
    </div>
  );
}