"use client";
import { useOperationChanges } from "@/lib/client/operation-changes";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import styles from "./store-home.module.css";
import { useStoreTheme } from "./store-theme";

type IconName = "truck" | "shop" | "clipboard" | "users" | "user" | "check" | "package" | "clock" | "calendar" | "sun" | "moon" | "activity" | "menu";
export function StoreIcon({ name, size = 24 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    truck: <><path d="M2 5h12v12H2zM14 10h4l4 4v3h-8"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></>,
    shop: <><path d="M3 10h18l-2-6H5l-2 6ZM4 11v10h16V11M9 21v-7h6v7M8 4v6M16 4v6"/><path d="M3 10c0 3 4 3 5 0 1 3 4 3 4 0 1 3 4 3 4 0 1 3 5 3 5 0"/></>,
    clipboard: <><rect x="5" y="5" width="14" height="17" rx="2"/><path d="M9 3h6v4H9zM9 12h6M9 16h6"/></>,
    users: <><circle cx="9" cy="7" r="3"/><path d="M2 21v-3a7 7 0 0 1 14 0v3ZM17 4a3 3 0 0 1 0 6M19 14c3 1 3 4 3 7"/></>,
    user: <><circle cx="12" cy="7" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3Z"/></>,
    check: <><circle cx="12" cy="12" r="9"/><path d="m7 12 3 3 7-7"/></>,
    package: <><path d="m12 2 9 5-9 5-9-5 9-5ZM3 7v10l9 5 9-5V7M12 12v10M7 5l10 5"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 2v6M17 2v6M3 11h18M8 15h2M14 15h2"/></>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 1v2M12 21v2M1 12h2M21 12h2M4 4l2 2M18 18l2 2M4 20l2-2M18 6l2-2"/></>,
    moon: <path d="M21 13A9 9 0 0 1 11 3a9 9 0 1 0 10 10Z"/>,
    activity: <><path d="m3 16 5-5 4 3 7-9M14 5h5v5"/></>,
    menu: <path d="M4 6h16M4 12h16M4 18h16"/>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

type Summary = {
  day: string;
  counts: { total: number; ready: number; delivered: number };
  recent: Array<{ id: string; kind: "ORDER" | "SALE"; number: string; status: string; at: string }>;
};
type Props = {
  employeeName: string;
  openedAt: string;
  switching: boolean;
  closing: boolean;
  error: string;
  onSwitch: () => void;
  onClose: () => void;
  children: ReactNode;
};
const labels: Record<string, string> = { NEW: "طلب جديد", READY: "جاهز للتسليم", DELIVERED: "تم التسليم", CANCELLED: "ملغي", SALE: "تم البيع" };
const actions: Array<{ href: string; icon: IconName; title: string; description: string; tone: string }> = [
  { href: "/employee/orders/new", icon: "truck", title: "طلب توصيل جديد", description: "تسجيل طلب توصيل لعميل جديد", tone: "blue" },
  { href: "/employee/sale", icon: "shop", title: "بيع مباشر", description: "بيع سريع للزبون داخل المحل", tone: "green" },
  { href: "/employee/orders", icon: "clipboard", title: "طلبات اليوم", description: "عرض ومتابعة طلبات اليوم", tone: "purple" },
  { href: "/employee/customers", icon: "users", title: "العملاء", description: "بحث وإضافة العملاء", tone: "neutral" },
];
function formatTime(value: string | Date) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Amman", hour: "2-digit", minute: "2-digit", hourCycle: "h23", numberingSystem: "latn" }).format(new Date(value));
}

export default function StoreHome(props: Props) {
  const { theme, toggleTheme } = useStoreTheme();
  const [now, setNow] = useState<Date | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loadError, setLoadError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setNow(new Date());
    }, 0);
    const clock = window.setInterval(() => setNow(new Date()), 1000);
    return () => { window.clearTimeout(timer); window.clearInterval(clock); };
  }, []);
  useEffect(() => {
    let cancelled = false;
    let busy = false;
    const controller = new AbortController();
    async function refresh() {
      if (busy || document.visibilityState === "hidden") return;
      busy = true;
      try {
        const response = await fetch("/api/operator/home", { cache: "no-store", signal: controller.signal });
        if (response.status === 401 || response.status === 403 || response.status === 423) {
          // Re-enter the existing server-side session gate; never display cached
          // operational data after the employee session has been rejected.
          if (!cancelled) window.location.replace("/employee");
          return;
        }
        const result = await response.json();
        if (!response.ok || result.success !== true) throw new Error("summary");
        if (!cancelled) { setSummary(result.data as Summary); setLoadError(""); }
      } catch {
        if (!cancelled) { setSummary(null); setLoadError("تعذر تحديث ملخص اليوم. تحقق من الاتصال؛ يمكنك استخدام أزرار العمليات."); }
      } finally { busy = false; }
    }
    void refresh();
    const update = () => void refresh();
    window.addEventListener("alfanar:home-refresh", update);
    const visible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("online", visible);
    return () => { cancelled = true; controller.abort(); window.removeEventListener("alfanar:home-refresh", update); document.removeEventListener("visibilitychange", visible); window.removeEventListener("online", visible); };
  }, []);
  useOperationChanges(["home", "orders"], () => window.dispatchEvent(new Event("alfanar:home-refresh")));
  const elapsed = now ? Math.max(0, Math.floor((now.getTime() - new Date(props.openedAt).getTime()) / 60000)) : null;
  const currentDay = now ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Amman", year: "numeric", month: "2-digit", day: "2-digit" }).format(now).replace(/-/g, "") : null;
  const data = summary && (!currentDay || summary.day === currentDay) ? summary : null;
  return (
    <main className={styles.page} data-theme={theme} dir="rtl" lang="ar">
      <div className={styles.container}>
        <header className={styles.header}>
          <div className={styles.brand}><span className={styles.logo}>ف</span><div><strong>محطة الفنار</strong><small>نظام تشغيل المحل</small></div></div>
          <div className={styles.identity}><span className={styles.avatar}><StoreIcon name="user" size={22}/></span><div><small>الموظف الحالي</small><strong>{props.employeeName}</strong></div></div>
          <button type="button" className={styles.menuToggle} aria-label="خيارات الموظف والشفت" aria-expanded={menuOpen} aria-controls="store-header-controls" onClick={() => setMenuOpen(!menuOpen)}><StoreIcon name="menu" size={21}/></button>
          <div className={styles.shift}><strong><i className={styles.liveDot}/> الشفت مفتوح</strong><small>{elapsed === null ? "جاري حساب مدة الشفت…" : elapsed < 60 ? `منذ ${elapsed} دقيقة` : `منذ ${Math.floor(elapsed / 60)} ساعة و${elapsed % 60} دقيقة`}</small></div>
          <div className={styles.date}><strong><StoreIcon name="clock" size={17}/><b dir="ltr">{now ? formatTime(now) : "--:--"}</b></strong><small><StoreIcon name="calendar" size={15}/>{now ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Amman", weekday: "long", year: "numeric", month: "long", day: "numeric" }).format(now) : "بتوقيت الأردن"}</small></div>
          <button type="button" className={styles.themeToggle} onClick={toggleTheme} aria-label={theme === "light" ? "تفعيل الوضع الداكن" : "تفعيل الوضع الفاتح"} aria-pressed={theme === "dark"}><span className={theme === "light" ? styles.sunActive : ""}><StoreIcon name="sun" size={19}/></span><span className={theme === "dark" ? styles.moonActive : ""}><StoreIcon name="moon" size={18}/></span></button>
          <div id="store-header-controls" className={`${styles.headerButtons} ${menuOpen ? styles.menuOpen : ""}`}><button className={styles.switchButton} type="button" disabled={props.switching || props.closing} onClick={props.onSwitch}><StoreIcon name="users" size={17}/>تبديل الموظف</button><button className={styles.closeButton} type="button" disabled={props.closing || props.switching} onClick={props.onClose}>{props.closing ? "جاري التجهيز…" : "إنهاء الشفت"}</button></div>
        </header>
        {(props.error || loadError) && <div role="alert" className={styles.error}>{props.error || loadError}</div>}
        <section className={styles.stats} aria-label="ملخص طلبات اليوم">
          {[{ label: "طلبات اليوم", value: data?.counts.total, icon: "clipboard" as const, tone: "blue" }, { label: "جاهز للتسليم", value: data?.counts.ready, icon: "package" as const, tone: "orange" }, { label: "تم التسليم", value: data?.counts.delivered, icon: "check" as const, tone: "green" }].map(item => <div className={`${styles.stat} ${styles[item.tone]}`} key={item.label}><span className={styles.statIcon}><StoreIcon name={item.icon} size={27}/></span><div><strong>{item.value ?? "—"}</strong><span>{item.label}</span></div></div>)}
        </section>
        <nav className={styles.actions} aria-label="عمليات المحل">{actions.map(action => <Link key={action.href} href={action.href} className={`${styles.action} ${styles[action.tone]}`}><span className={styles.actionIcon}><StoreIcon name={action.icon} size={32}/></span><div><strong>{action.title}</strong><small>{action.description}</small></div><span className={styles.arrow} aria-hidden="true">←</span></Link>)}</nav>
        <section className={styles.activity} aria-labelledby="store-activity-title"><div className={styles.activityHeader}><h1 id="store-activity-title"><span><StoreIcon name="activity" size={21}/></span>آخر العمليات اليوم</h1><Link href="/employee/orders">عرض الطلبات <span aria-hidden="true">←</span></Link></div>
          {!data ? <p className={styles.empty}>{loadError ? "الملخص غير متاح حاليًا." : "جاري تحميل ملخص اليوم…"}</p> : data.recent.length === 0 ? null : <ul className={styles.activityList}>{data.recent.map(item => <li key={`${item.kind}-${item.id}`}><span className={styles.rowIcon}><StoreIcon name={item.kind === "SALE" ? "shop" : "truck"} size={20}/></span><p><strong>{item.kind === "SALE" ? "بيع مباشر" : `طلب توصيل #${item.number}`}</strong><span> — {item.kind === "SALE" ? "تم تسجيل البيع" : labels[item.status]}</span></p><span className={`${styles.badge} ${styles[item.status === "DELIVERED" || item.status === "SALE" ? "green" : item.status === "READY" ? "orange" : item.status === "CANCELLED" ? "red" : "blue"]}`}>{labels[item.status]}</span><time dateTime={item.at} className={styles.time}><StoreIcon name="clock" size={14}/><span dir="ltr">{formatTime(item.at)}</span></time></li>)}</ul>}
        </section>
      </div>
      {props.children}
    </main>
  );
}
