"use client";

import { useLayoutEffect, useSyncExternalStore, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import styles from "./store-theme.module.css";

type Theme = "light" | "dark";
const STORAGE_KEY = "alfanar-store-theme";
const CHANGE_EVENT = "alfanar-store-theme-change";
let memoryPreference: Theme | null = null;

function getTheme(): Theme {
  if (typeof window === "undefined") return "light";
  if (memoryPreference) return memoryPreference;
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch { /* Retain the current selection if browser storage is unavailable. */ }
  return memoryPreference ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
}

function subscribe(listener: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) {
      memoryPreference = null;
      listener();
    }
  };
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener("storage", onStorage);
  window.addEventListener("pageshow", listener);
  media.addEventListener("change", listener);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("pageshow", listener);
    media.removeEventListener("change", listener);
  };
}

export function useStoreTheme() {
  const theme = useSyncExternalStore(subscribe, getTheme, () => "light" as Theme);
  function toggleTheme() {
    const next = getTheme() === "dark" ? "light" : "dark";
    memoryPreference = next;
    try { window.localStorage.setItem(STORAGE_KEY, next); } catch { /* Optional browser preference, never authentication data. */ }
    // Activate legacy page and modal selectors immediately, then notify every
    // mounted control. No session or financial data is stored in the browser.
    document.documentElement.dataset.theme = next;
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }
  return { theme, toggleTheme };
}

export function StoreTheme({ children }: { children: ReactNode }) {
  const { theme, toggleTheme } = useStoreTheme();
  const pathname = usePathname();
  useLayoutEffect(() => {
    const html = document.documentElement;
    const previous = html.getAttribute("data-theme");
    return () => {
      if (previous === null) html.removeAttribute("data-theme");
      else html.setAttribute("data-theme", previous);
    };
  }, []);
  useLayoutEffect(() => {
    // Read persisted preference before paint, including a hard reload on a
    // nested employee URL. The shared layout remains mounted during navigation.
    document.documentElement.dataset.theme = getTheme();
  }, [theme]);

  return <div className={styles.scope} data-theme={theme}>
    {children}
    {pathname !== "/employee" && <button type="button" className={styles.toggle} onClick={toggleTheme} aria-label={theme === "dark" ? "تفعيل الوضع الفاتح" : "تفعيل الوضع الداكن"} aria-pressed={theme === "dark"} title="تغيير مظهر جميع صفحات المحل">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">{theme === "dark" ? <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1 1M18 18l1 1M5 19l1-1M18 6l1-1"/></> : <path d="M21 13A9 9 0 0 1 11 3a9 9 0 1 0 10 10Z"/>}</svg>
      <span>{theme === "dark" ? "الوضع الفاتح" : "الوضع الداكن"}</span>
    </button>}
  </div>;
}
