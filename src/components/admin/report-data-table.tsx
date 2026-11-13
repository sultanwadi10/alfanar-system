"use client";
import { useState,type ReactNode } from "react";
import styles from "./management.module.css";
export function DataTable<T extends { id: string }>({ title, headers, rows, render, note, tools }: { title: string; headers: string[]; rows: T[]; render: (row: T) => ReactNode; note?: string; tools?: ReactNode }) {
  const [page, setPage] = useState(0), pages = Math.max(1, Math.ceil(rows.length / 25)), current = Math.min(page, pages - 1);
  return <section className={styles.card}><div className={styles.sectionHeader}><div><h2>{title}</h2>{note && <p className={styles.subtitle}>{note}</p>}</div>{tools}</div><div className={styles.tableWrap}><table className={styles.table}><thead><tr>{headers.map(title => <th key={title} scope="col">{title}</th>)}</tr></thead><tbody>{rows.slice(current * 25, (current + 1) * 25).map(row => <tr key={row.id}>{render(row)}</tr>)}</tbody></table></div>{!rows.length && <p className={styles.empty}>لا توجد سجلات مطابقة للفترة والفلاتر المختارة.</p>}{!!rows.length && <footer className={styles.pagination}><span>{rows.length} سجل • صفحة {current + 1} من {pages}</span><div className={styles.actions}><button disabled={!current} onClick={() => setPage(current - 1)}>السابق</button><button disabled={current + 1 === pages} onClick={() => setPage(current + 1)}>التالي</button></div></footer>}</section>;
}
