"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type SetStateAction } from "react";
import Link from "next/link";
import { receiveOperationChanges, useOperationChanges } from "@/lib/client/operation-changes";
import { usePathname } from "next/navigation";
import { LogoutButton } from "@/components/auth/logout-button";
import { AlfanarIcon, type AlfanarIconName } from "./alfanar-icon";
import { AdminOverviewContext } from "./admin-overview-context";
import type { DashboardStatus } from "@/types/admin-overview";
import styles from "./admin-shell.module.css";
const navigation: Array<{ href: string; label: string; icon: AlfanarIconName; group?: string }> = [
  { href: "/admin", label: "لوحة التحكم", icon: "grid" },
  { href: "/admin/orders", label: "الطلبات", icon: "cart" },
  { href: "/admin/customers", label: "العملاء", icon: "users" },
  { href: "/admin/coupons", label: "الكوبونات", icon: "ticket" },
  { href: "/admin/pricing", label: "الأصناف والأسعار", icon: "tag", group: "البضاعة والتشغيل" },
  { href: "/admin/inventory", label: "المخزون", icon: "package" },
  { href: "/admin/cooler", label: "الثلاجة", icon: "snowflake" },
  { href: "/admin/employees", label: "الموظفون", icon: "user", group: "الإدارة" },
  { href: "/admin/reports", label: "التقارير", icon: "bars" },
  { href: "/admin/settings", label: "الإعدادات", icon: "settings" },
];
export function AdminShell({ children, initialStatus = null }: { children: ReactNode; initialStatus?: DashboardStatus | null }) {
  const pathname = usePathname(), [sidebarOpen, setSidebarOpen] = useState(false), [notificationsOpen, setNotificationsOpen] = useState(false), [theme, setTheme] = useState<"light" | "dark">("light"), [status, setStatus] = useState(initialStatus), [clock, setClock] = useState(initialStatus?.at ?? ""), [statusFailed, setStatusFailed] = useState(false);
  const notificationRef = useRef<HTMLDivElement>(null);
  const receiveStatus = useCallback((next: SetStateAction<DashboardStatus | null>) => { setStatus(next); setStatusFailed(false); }, []);
  const context = useMemo(() => ({ status, setStatus: receiveStatus }), [status, receiveStatus]);
  useEffect(() => {
    let saved = document.documentElement.dataset.theme;
    try { saved = window.localStorage.getItem("alfanar-theme") ?? saved; } catch {}
    const mode = saved === "dark" ? "dark" : "light";
    const frame = window.requestAnimationFrame(() => { document.documentElement.dataset.theme = mode; setTheme(mode); });
    const timer = window.setTimeout(() => setClock(new Date().toISOString()), 0), interval = window.setInterval(() => setClock(new Date().toISOString()), 30000);
    return () => { window.cancelAnimationFrame(frame); window.clearTimeout(timer); window.clearInterval(interval); };
  }, []);
  useOperationChanges(["access", "orders", "inventory"], () => { if (pathname !== "/admin") window.dispatchEvent(new Event("alfanar:header-refresh")); });
  useEffect(() => {
    if (pathname === "/admin") return;
    let alive = true, nextCheckAt = 0; const controller = new AbortController();
    const refresh = async () => {
      if (document.visibilityState !== "visible" || Date.now() < nextCheckAt) return;
      try { const response = await fetch("/api/admin/dashboard-status", { cache: "no-store", signal: controller.signal }); const result = await response.json(); if (!response.ok || !result.success) throw Error("status"); if (alive) { nextCheckAt = 0; setStatus(result.data); setStatusFailed(false); } }
      catch { nextCheckAt = Date.now() + 300000; if (alive) setStatusFailed(true); }
    };
    const update = () => void refresh();
    const timer = window.setTimeout(update, 0);
    window.addEventListener("alfanar:header-refresh", update);
    return () => { alive = false; controller.abort(); window.clearTimeout(timer); window.removeEventListener("alfanar:header-refresh", update); };
  }, [pathname]);
  useEffect(() => {
    let busy = false; const controller = new AbortController();
    const check = async () => {
      if (busy || document.visibilityState !== "visible") return;
      busy = true;
      try { const response = await fetch("/api/admin/changes", { cache: "no-store", signal: controller.signal }); if (response.ok) { const result = await response.json(); if (result.success) receiveOperationChanges(result.data); } } catch {} finally { busy = false; }
    };
    void check(); const interval = window.setInterval(() => void check(), 15000);
    const visible = () => { if (document.visibilityState === "visible") void check(); };
    document.addEventListener("visibilitychange", visible);
    return () => { controller.abort(); window.clearInterval(interval); document.removeEventListener("visibilitychange", visible); };
  }, []);
  useEffect(() => {
    if (!notificationsOpen) return;
    const close = (event: PointerEvent) => { if (!notificationRef.current?.contains(event.target as Node)) setNotificationsOpen(false); };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") setNotificationsOpen(false); };
    document.addEventListener("pointerdown", close); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", key); };
  }, [notificationsOpen]);
  useEffect(() => {
    if (!sidebarOpen) return;
    const overflow = document.body.style.overflow; document.body.style.overflow = "hidden";
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") setSidebarOpen(false); };
    document.addEventListener("keydown", key); return () => { document.body.style.overflow = overflow; document.removeEventListener("keydown", key); };
  }, [sidebarOpen]);
  function changeTheme(mode: "light" | "dark") { document.documentElement.dataset.theme = mode; setTheme(mode); try { window.localStorage.setItem("alfanar-theme", mode); } catch {} }
  const shift = status?.shifts[0], notificationCount = status ? status.pendingCount + status.lowStockCount + (status.owedBottles > 0 ? 1 : 0) : 0;
  const time = clock ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Amman", hour: "2-digit", minute: "2-digit", hourCycle: "h23", numberingSystem: "latn" }).format(new Date(clock)) : "—";
  return <AdminOverviewContext.Provider value={context}><div className={styles.shell} dir="rtl">
    <header className={styles.header}>
      <div className={styles.brand}><button type="button" className={styles.menuButton} aria-label="فتح القائمة" aria-expanded={sidebarOpen} aria-controls="admin-navigation" onClick={() => setSidebarOpen(!sidebarOpen)}><AlfanarIcon name="menu"/></button><span className={styles.brandMark}>ف</span><strong>محطة الفنار</strong><span className={styles.brandDivider}/><span className={styles.brandCaption}>لوحة الإدارة</span></div>
      <div className={styles.shift} title={status?.shifts.map(s => s.employee).join("، ")}><i className={shift ? styles.online : styles.offline}/><strong>{status ? shift ? "الشفت مفتوح" : "لا يوجد شفت مفتوح" : "حالة الشفت غير متاحة"}</strong>{shift && <><span className={styles.shiftDivider}/><AlfanarIcon name="user" size={16}/><span>{shift.employee}{status!.shifts.length > 1 ? ` +${status!.shifts.length - 1}` : ""}</span><span className={styles.shiftDivider}/><AlfanarIcon name="clock" size={16}/><small>منذ {new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Amman", hour: "2-digit", minute: "2-digit", hourCycle: "h23", numberingSystem: "latn" }).format(new Date(shift.openedAt))}</small></>}</div>
      <div className={styles.headerActions}><div className={styles.clock}><bdi dir="ltr">{time}</bdi><AlfanarIcon name="calendar" size={17}/><span>اليوم</span></div>
        <div className={styles.notificationWrapper} ref={notificationRef}><button type="button" className={styles.iconButton} aria-label={`تنبيهات الإدارة${notificationCount ? `: ${notificationCount}` : ""}`} aria-expanded={notificationsOpen} onClick={() => setNotificationsOpen(!notificationsOpen)}><AlfanarIcon name="bell" size={23}/>{notificationCount > 0 && <span className={styles.badge}>{notificationCount > 99 ? "99+" : notificationCount}</span>}</button>{notificationsOpen && <div className={styles.notifications}><strong>يحتاج انتباهك</strong>{statusFailed && <p>تعذر التحديث؛ هذه آخر قراءة متاحة.</p>}{status?.pendingCount ? <Link href="/admin/orders">{status.pendingCount} طلبات تنتظر التسليم <AlfanarIcon name="truck"/></Link> : null}{status?.lowStockCount ? <Link href="/admin/inventory">{status.lowStockCount} أصناف تحت حد التنبيه <AlfanarIcon name="package"/></Link> : null}{status?.owedBottles ? <Link href="/admin/inventory?tab=debts">{status.owedBottles} قوارير مستحقة على العملاء <AlfanarIcon name="coins"/></Link> : null}{status && notificationCount === 0 && <p>لا توجد تنبيهات تشغيلية حاليًا.</p>}{!status && <p>تعذر تحميل حالة التشغيل.</p>}</div>}</div>
        <div className={styles.themeSwitch}><button type="button" aria-label="الوضع الفاتح" aria-pressed={theme === "light"} onClick={() => changeTheme("light")}><AlfanarIcon name="sun" size={19}/></button><button type="button" aria-label="الوضع الداكن" aria-pressed={theme === "dark"} onClick={() => changeTheme("dark")}><AlfanarIcon name="moon" size={19}/></button></div>
        <LogoutButton target="admin" className={styles.logout} label={<><span>خروج</span><AlfanarIcon name="logout" size={18}/></>}/>
      </div>
    </header>
    <aside id="admin-navigation" className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ""}`} aria-label="قائمة الإدارة"><div className={styles.mobileMenuTitle}><strong>القائمة</strong><button aria-label="إغلاق القائمة" onClick={() => setSidebarOpen(false)}><AlfanarIcon name="x"/></button></div><nav>{navigation.map(item => { const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href); return <div key={item.href}>{item.group && <small className={styles.groupTitle}>{item.group}</small>}<Link href={item.href} aria-current={active ? "page" : undefined} className={active ? styles.activeLink : styles.navLink} onClick={() => setSidebarOpen(false)}><AlfanarIcon name={item.icon} size={23}/><span>{item.label}</span></Link></div>; })}</nav><footer className={styles.sidebarFooter}>Powered by <strong>GLE TECHNOLOGY</strong></footer></aside>
    {sidebarOpen && <button type="button" className={styles.overlay} aria-label="إغلاق القائمة" onClick={() => setSidebarOpen(false)}/>}
    <main className={styles.mainContent}>{children}</main>
  </div></AdminOverviewContext.Provider>;
}
