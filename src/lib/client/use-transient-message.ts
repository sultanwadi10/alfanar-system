"use client";
import { useEffect } from "react";
// Success feedback is brief and non-blocking; errors never use this timer.
export function useTransientMessage(message: string, clear: (value: string) => void) {
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => clear(""), 4000);
    return () => window.clearTimeout(timer);
  }, [message, clear]);
}
