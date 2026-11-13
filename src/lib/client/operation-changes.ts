"use client";
import { useEffect, useRef } from "react";
import type { ChangeChannel, OperationChanges } from "@/lib/updates/operation-changes";
const eventName = "alfanar:operation-changes";
const previous: Partial<OperationChanges> = {};
export function receiveOperationChanges(value: unknown) {
  if (!value || typeof value !== "object") return;
  const changed: ChangeChannel[] = [];
  for (const channel of ["orders", "catalog", "inventory", "home", "access"] as const) {
    const next = (value as Partial<OperationChanges>)[channel];
    if (typeof next !== "string") continue;
    if (previous[channel] !== undefined && previous[channel] !== next) changed.push(channel);
    previous[channel] = next;
  }
  if (changed.length) window.dispatchEvent(new CustomEvent(eventName, { detail: changed }));
}

// No initial fetch: each screen owns its entry request. Keep a reconciliation
// fallback for a missed publication, midnight, deployments and offline devices.
export function useOperationChanges(channels: readonly ChangeChannel[], refresh: () => void, enabled = true) {
  const latest = useRef({ channels, refresh, enabled }), dirty = useRef(false);
  useEffect(() => {
    latest.current = { channels, refresh, enabled };
    if (!enabled || !dirty.current || document.visibilityState !== "visible") return;
    const timer = window.setTimeout(() => { dirty.current = false; latest.current.refresh(); }, 0);
    return () => window.clearTimeout(timer);
  }, [channels, refresh, enabled]);
  useEffect(() => {
    let last = 0, deferred: number | undefined;
    const run = () => {
      if (document.visibilityState !== "visible" || !latest.current.enabled) { dirty.current = true; return; }
      if (Date.now() - last < 2000) {
        dirty.current = true;
        if (deferred === undefined) deferred = window.setTimeout(() => { deferred = undefined; run(); }, 2000 - (Date.now() - last));
        return;
      }
      last = Date.now(); dirty.current = false; latest.current.refresh();
    };
    const change = (event: Event) => { const changed = (event as CustomEvent<ChangeChannel[]>).detail; if (changed?.some(channel => latest.current.channels.includes(channel))) run(); };
    const interval = window.setInterval(run, 300000);
    window.addEventListener(eventName, change); window.addEventListener("online", run);
    document.addEventListener("visibilitychange", run);
    return () => { window.clearInterval(interval); if (deferred !== undefined) window.clearTimeout(deferred); window.removeEventListener(eventName, change); window.removeEventListener("online", run); document.removeEventListener("visibilitychange", run); };
  }, []);
}
