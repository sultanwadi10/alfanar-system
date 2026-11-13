"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import ActionModal from "@/components/ui/action-modal";
type Confirmation = { title: string; description?: string; confirmLabel?: string; tone?: "info" | "warning" | "danger" };
export function useConfirmation() {
  const [pending, setPending] = useState<Confirmation | null>(null);
  const resolver = useRef<((confirmed: boolean) => void) | null>(null);
  const finish = useCallback((confirmed: boolean) => {
    const resolve = resolver.current;
    resolver.current = null;
    setPending(null);
    resolve?.(confirmed);
  }, []);
  const confirm = useCallback((options: Confirmation) => {
    // Ignore repeated taps while a decision is already open.
    if (resolver.current) return Promise.resolve(false);
    return new Promise<boolean>(resolve => { resolver.current = resolve; setPending(options); });
  }, []);
  useEffect(() => () => { const resolve = resolver.current; resolver.current = null; resolve?.(false); }, []);
  const confirmationDialog = <ActionModal open={pending !== null} title={pending?.title ?? "تأكيد العملية"} description={pending?.description ?? ""} tone={pending?.tone ?? "warning"} confirmLabel={pending?.confirmLabel ?? "تأكيد"} cancelLabel="إلغاء" onConfirm={() => finish(true)} onClose={() => finish(false)}/>;
  return { confirm, confirmationDialog };
}
