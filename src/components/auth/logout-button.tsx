"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type LogoutTarget = "admin" | "store";

type LogoutButtonProps = {
  target: LogoutTarget;
};

export function LogoutButton({
  target,
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
          data?.error?.message ?? "Logout failed.",
        );

        return;
      }

      router.replace("/login");
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unexpected logout error.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleLogout}
        disabled={loading}
      >
        {loading ? "Signing out..." : "Logout"}
      </button>

      {errorMessage && (
        <p>{errorMessage}</p>
      )}
    </div>
  );
}