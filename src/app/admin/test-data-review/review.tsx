"use client";
import { userMessage } from "@/lib/client/user-message";
import { useEffect, useState } from "react";
import type { TrialReview } from "@/lib/inventory/test-data-review";
import styles from "../inventory/inventory.module.css";
export default function Review() {
  const [data, setData] = useState<TrialReview | null>(null), [error, setError] = useState("");
  useEffect(() => { let alive = true; fetch("/api/admin/test-data-review", { cache: "no-store" }).then(async r => { const result = await r.json(); if (!r.ok || !result.success) throw Error(result.error?.message ?? "تعذر تحميل التقرير."); if (alive) setData(result.data); }).catch(e => { if (alive) setError(userMessage(e.message)); }); return () => { alive = false; }; }, []);
  function download() { const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })); const a = document.createElement("a"); a.href = url; a.download = "alfanar-test-data-review.json"; a.click(); URL.revokeObjectURL(url); }
  return <main className={styles.page} dir="rtl"><h1>مراجعة بيانات التجربة</h1><p className={styles.notice}>لم يُحذف أو يُصفّر أي شيء. هذه الصفحة تعرض نطاق التنظيف المقترح فقط.</p>{error && <p className={styles.error} role="alert">{error}</p>}{!data && !error && <p>جارٍ تجهيز التقرير…</p>}{data && <><p>{data.scope}</p><button onClick={download}>تنزيل تقرير المراجعة</button><section className={styles.panel}>{data.notes.map(note => <p className={styles.hint} key={note}>{note}</p>)}{data.rows.map(row => <article className={styles.productRow} key={row.collection}><strong>{row.collection}</strong><span>{row.documents} مستند</span><span>{row.decision === "TRIAL" ? "بيانات تجربة — مقترح تنظيفها" : row.decision === "PRESERVE" ? "مقترح الاحتفاظ بها" : "تحتاج مراجعة"}</span></article>)}</section></>}</main>;
}
