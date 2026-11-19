"use client";
import { userMessage } from "@/lib/client/user-message";
import { useTransientMessage } from "@/lib/client/use-transient-message";
import { useState, type FormEvent } from "react";
import { WeeklyRosterEditor } from "./weekly-roster-editor";
import type { RosterWeek } from "@/lib/employees/roster-week";
import { AdminDialog } from "@/components/admin/admin-dialog";
import { AlfanarIcon } from "@/components/admin/alfanar-icon";
import { dinars, parseDinars } from "@/lib/format/money-input";
import styles from "@/components/admin/management.module.css";

type EmployeeView = { id: string; name: string; isActive: boolean; createdAt: string };
export function EmployeesManager({ employees, initialRoster, wageSettings }: { employees: EmployeeView[]; initialRoster: RosterWeek; wageSettings: { dailyWageFils: number | null } }) {
  const [people, setPeople] = useState(employees);
  const [rate, setRate] = useState(wageSettings.dailyWageFils === null ? "" : (wageSettings.dailyWageFils / 1000).toFixed(3)), [savedRate, setSavedRate] = useState(wageSettings.dailyWageFils);
  const [tab, setTab] = useState("people"), [search, setSearch] = useState("");
  const [modal, setModal] = useState<{ mode: "add" | "edit" | "pin" | "status"; employee?: EmployeeView } | null>(null), [name, setName] = useState(""), [pin, setPin] = useState(""), [showPin, setShowPin] = useState(false);
  const [busy, setBusy] = useState(""), [error, setError] = useState(""), [success, setSuccess] = useState("");
  useTransientMessage(success, setSuccess);
  async function mutate(key: string, url: string, body: unknown, method: string, done: (data: Record<string, unknown>) => void) {
    if (busy) return; setBusy(key); setError(""); setSuccess("");
    try {
      const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok || result.success !== true) throw Error(response.status === 401 ? "انتهت جلسة الإدارة. سجّل الدخول من تبويب آخر، ثم ارجع وأعد الحفظ؛ مدخلاتك محفوظة هنا." : result.error?.message ?? "تعذر الحفظ.");
      done(result.data ?? {}); setSuccess("تم الحفظ.");
    } catch (error) { setError(userMessage(error instanceof Error ? error.message : "تعذر الاتصال. مدخلاتك محفوظة؛ أعد المحاولة.")); }
    finally { setBusy(""); }
  }
  function open(mode: "add" | "edit" | "pin" | "status", employee?: EmployeeView) { setError(""); setSuccess(""); setName(employee?.name ?? ""); setPin(""); setShowPin(false); setModal({ mode, employee }); }
  function submitEmployee(event: FormEvent) {
    event.preventDefault(); if (!modal) return;
    const employee = modal.employee;
    if (modal.mode === "status" && employee) { void mutate("status", `/api/admin/employees/${employee.id}/status`, { isActive: !employee.isActive }, "PATCH", () => { setPeople(list => list.map(e => e.id === employee.id ? { ...e, isActive: !e.isActive } : e)); setModal(null); }); return; }
    if (modal.mode !== "edit" && !/^\d{4,6}$/.test(pin)) { setError(userMessage("رمز الدخول من 4 إلى 6 أرقام.")); return; }
    const url = modal.mode === "add" ? "/api/admin/employees" : `/api/admin/employees/${employee!.id}${modal.mode === "pin" ? "/pin" : ""}`;
    const body = modal.mode === "add" ? { name, pin } : modal.mode === "edit" ? { name } : { pin };
    void mutate("employee", url, body, modal.mode === "add" ? "POST" : "PATCH", data => {
      if (modal.mode === "add") setPeople(list => [data.employee as EmployeeView, ...list]);
      if (modal.mode === "edit") setPeople(list => list.map(e => e.id === employee!.id ? { ...e, name: name.trim() } : e));
      setModal(null); setPin("");
    });
  }
  const visible = people.filter(e => e.name.includes(search.trim()));
  const money = (value: number) => <span className={styles.money}><bdi>{dinars(value)}</bdi> د.أ</span>;
  const feedback = <>{error && <p role="alert" className={styles.feedback}>{error}</p>}{success && <p role="status" className={`${styles.feedback} ${styles.success}`}>{success}</p>}</>;
  return <main className={styles.page} dir="rtl">
    <header className={styles.heading}><div><h1>الموظفون وجدول الدوام</h1></div><button className={styles.primary} onClick={() => open("add")} disabled={!!busy}><AlfanarIcon name="plus" />إضافة موظف</button></header>
    {!modal && feedback}
    <nav className={styles.tabs} role="tablist" aria-label="إدارة الموظفين"><button role="tab" aria-selected={tab === "people"} onClick={() => setTab("people")}>الموظفون</button><button role="tab" aria-selected={tab === "schedule"} onClick={() => setTab("schedule")}>جدول الدوام</button><button role="tab" aria-selected={tab === "settings"} onClick={() => setTab("settings")}>اليومية</button></nav>
    {tab === "people" && <section className={styles.card}><div className={styles.sectionHeader}><div><h2>فريق العمل</h2><p className={styles.subtitle}>{people.filter(e => e.isActive).length} موظف فعّال • {people.length} إجمالي الموظفين</p></div><input className={styles.search} placeholder="البحث عن موظف…" aria-label="البحث عن موظف" value={search} onChange={e => setSearch(e.target.value)} /></div>
      <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>الموظف</th><th>الحالة</th><th>الإجراءات</th></tr></thead><tbody>{visible.map(e => <tr key={e.id}><td><div className={styles.person}><span className={styles.avatar}>{e.name.slice(0, 1)}</span><strong>{e.name}</strong></div></td><td><span className={e.isActive ? styles.good : styles.badge}><i className={styles.dot} />{e.isActive ? "فعّال" : "معطّل"}</span></td><td><div className={styles.actions}><button onClick={() => open("edit", e)} disabled={!!busy}>تعديل</button><button onClick={() => open("pin", e)} disabled={!!busy}><AlfanarIcon name="shield" />رمز الدخول</button><button className={e.isActive ? styles.danger : ""} onClick={() => open("status", e)} disabled={!!busy}>{e.isActive ? "تعطيل" : "تفعيل"}</button></div></td></tr>)}</tbody></table></div>{!visible.length && <p className={styles.empty}>لا يوجد موظفون مطابقون.</p>}
      <div className={styles.note}>اليومية الموحدة لليوم: {savedRate === null ? "لم تُحدد بعد" : money(savedRate)} • <button onClick={() => setTab("settings")}>تعديل اليومية</button></div>
    </section>}
    <div hidden={tab !== "people" && tab !== "schedule"}><WeeklyRosterEditor people={people} initialWeek={initialRoster} /></div>
    {tab === "settings" && <div className={styles.settings}>
      <section className={styles.card}><div className={styles.sectionHeader}><h2>اليومية الموحدة</h2><AlfanarIcon name="coins" /></div><div className={styles.body}><form className={styles.form} onSubmit={e => { e.preventDefault(); const value = parseDinars(rate); if (value === null) { setError(userMessage("أدخل مبلغًا صحيحًا بثلاث منازل عشرية كحد أقصى.")); return; } void mutate("wage", "/api/admin/employees/wage-settings", { dailyWageFils: value }, "PATCH", () => { setSavedRate(value); setRate((value / 1000).toFixed(3)); }); }}><label className={styles.field}><span>قيمة اليومية لليوم — بالدينار</span><input value={rate} onChange={e => setRate(e.target.value)} inputMode="decimal" placeholder="0.000" required disabled={!!busy} /></label><button className={styles.primary} disabled={!!busy}>{busy === "wage" ? "جارٍ الحفظ…" : "حفظ اليومية"}</button></form></div></section>
    </div>}
    {modal && <AdminDialog title={modal.mode === "add" ? "إضافة موظف" : modal.mode === "edit" ? "تعديل الموظف" : modal.mode === "pin" ? `رمز الدخول — ${modal.employee?.name}` : `${modal.employee?.isActive ? "تعطيل" : "تفعيل"} الموظف`} busy={!!busy} onClose={() => { setModal(null); setPin(""); setError(""); }}>{feedback}<form className={styles.form} onSubmit={submitEmployee}>
      {(modal.mode === "add" || modal.mode === "edit") && <label className={styles.field}><span>اسم الموظف</span><input value={name} onChange={e => setName(e.target.value)} minLength={2} maxLength={100} autoComplete="off" name="employee-display-name" required disabled={!!busy} /></label>}
      {(modal.mode === "add" || modal.mode === "pin") && <><label className={styles.field}><span>رمز الدخول PIN</span><input value={pin} onChange={e => setPin(e.target.value)} type={showPin ? "text" : "password"} inputMode="numeric" pattern="[0-9]{4,6}" maxLength={6} autoComplete="new-password" required disabled={!!busy} /></label><label className={styles.checkLabel}><input type="checkbox" checked={showPin} onChange={e => setShowPin(e.target.checked)} />إظهار الرمز المدخل</label></>}
      {modal.mode === "status" && <p>هل تريد {modal.employee?.isActive ? "تعطيل" : "تفعيل"} دخول {modal.employee?.name}؟</p>}
      <div className={styles.actions}><button className={styles.primary} disabled={!!busy}>{busy ? "جارٍ الحفظ…" : "حفظ"}</button><button type="button" onClick={() => setModal(null)} disabled={!!busy}>رجوع</button></div></form></AdminDialog>}
  </main>;
}
