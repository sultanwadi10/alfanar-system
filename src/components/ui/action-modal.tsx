"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import styles from "./action-modal.module.css";

export type ActionModalChoice = {
  value: string;
  label: string;
  description?: string;
};

type ActionModalProps = {
  open: boolean;
  title: string;
  description: string;
  tone?: "info" | "success" | "warning" | "danger";
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  confirmDisabled?: boolean;
  choices?: ActionModalChoice[];
  selectedChoice?: string | null;
  onChoiceChange?: (value: string) => void;
  children?: ReactNode;
  onConfirm: () => void;
  onClose: () => void;
};

/** A consistent, accessible, non-native confirmation dialog for operator/admin actions. */
export default function ActionModal({
  open,
  title,
  description,
  tone = "info",
  confirmLabel = "تأكيد",
  cancelLabel = "رجوع",
  busy = false,
  confirmDisabled = false,
  choices,
  selectedChoice,
  onChoiceChange,
  children,
  onConfirm,
  onClose,
}: ActionModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);
  useEffect(() => {
    closeRef.current = onClose;
    busyRef.current = busy;
  }, [onClose, busy]);

  useEffect(() => {
    if (!open) return;
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => cancelRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (!busyRef.current) {
          event.preventDefault();
          closeRef.current();
        }
        return;
      }
      if (event.key !== "Tab") return;
      const buttons = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? []);
      if (buttons.length === 0) return;
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      returnFocus?.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className={styles.overlay} dir="rtl" role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}>
      <div ref={panelRef} className={`${styles.panel} ${styles[tone]}`}
        role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined}>
        <div className={styles.heading}>
          <div className={styles.marker} aria-hidden="true">
            {tone === "danger" ? "!" : tone === "warning" ? "•" : "✓"}
          </div>
          <h2 id={titleId}>{title}</h2>
          <button type="button" className={styles.close} onClick={onClose} disabled={busy} aria-label="إغلاق النافذة">×</button>
        </div>
        {description && <p id={descriptionId} className={styles.description}>{description}</p>}
        {choices && choices.length > 0 && (
          <fieldset className={styles.options} disabled={busy}>
            <legend>اختر طريقة التحصيل</legend>
            <div className={styles.choiceGrid}>
              {choices.map((choice) => (
                <button type="button" key={choice.value}
                  className={`${styles.choice} ${selectedChoice === choice.value ? styles.selected : ""}`}
                  onClick={() => onChoiceChange?.(choice.value)}
                  aria-pressed={selectedChoice === choice.value}>
                  <span className={styles.radio} aria-hidden="true" />
                  <strong>{choice.label}</strong>
                  {choice.description && <small>{choice.description}</small>}
                </button>
              ))}
            </div>
          </fieldset>
        )}
        {children && <div className={styles.extra}>{children}</div>}
        <div className={styles.actions}>
          <button ref={cancelRef} type="button" className={styles.cancel} disabled={busy} onClick={onClose}>{cancelLabel}</button>
          <button type="button" className={styles.confirm} disabled={busy || confirmDisabled || (!!choices?.length && !selectedChoice)}
            onClick={onConfirm}>{busy ? "جارٍ تنفيذ العملية…" : confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
