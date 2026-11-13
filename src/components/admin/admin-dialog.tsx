"use client";
import { useEffect, useRef, type ReactNode } from "react";
import styles from "./management.module.css";
export function AdminDialog({ title, children, onClose, busy = false, wide = false }: { title: string; children: ReactNode; onClose: () => void; busy?: boolean; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} className={`${styles.dialog} ${wide ? styles.wideDialog : ""}`} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }} dir="rtl" aria-label={title}>
    <header className={styles.dialogHeader}><h2>{title}</h2><button type="button" onClick={onClose} disabled={busy} aria-label="إغلاق">×</button></header>{children}
  </dialog>;
}
