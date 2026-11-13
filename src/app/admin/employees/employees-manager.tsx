"use client";
import { userMessage } from "@/lib/client/user-message";
import { useTransientMessage } from "@/lib/client/use-transient-message";
import { useMemo,useState, type FormEvent } from "react";
import { RosterShareActions } from "@/components/admin/roster-share-actions";
import { buildRosterShare } from "@/lib/employees/roster-share";
import { AdminDialog } from "@/components/admin/admin-dialog";
import { AlfanarIcon } from "@/components/admin/alfanar-icon";
import { dinars, parseDinars } from "@/lib/format/money-input";
import type { EmployeeSchedule, EmployeeShiftTimeSettings, EmployeeShiftType, EmployeeWeekday } from "@/types/employee-schedule";
import styles from "@/components/admin/management.module.css";

type EmployeeView = { id: string; name: string; isActive: boolean; createdAt: string };
type Option = "REST" | "MORNING" | "EVENING" | "BOTH";
export const scheduleDays: { key: EmployeeWeekday; label: string }[] = [
  { key: "sunday", label: "الأحد" }, { key: "monday", label: "الاثنين" }, { key: "tuesday", label: "الثلاثاء" }, { key: "wednesday", label: "الأربعاء" }, { key: "thursday", label: "الخميس" }, { key: "friday", label: "الجمعة" }, { key: "saturday", label: "السبت" },
];
function emptySchedule(): EmployeeSchedule { return { sunday: [], monday: [], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [] }; }
function option(shifts: EmployeeShiftType[]): Option { return shifts.length === 2 ? "BOTH" : shifts[0] ?? "REST"; }
function shifts(value: Option): EmployeeShiftType[] { return value === "BOTH" ? ["MORNING", "EVENING"] : value === "REST" ? [] : [value]; }
export function displayTime(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour < 12 ? "ص" : "م"}`;
}
export function WeeklyRoster({ employees, schedules, settings }: { employees: EmployeeView[]; schedules: Record<string, EmployeeSchedule>; settings: EmployeeShiftTimeSettings }) {
  const names = (day: EmployeeWeekday, shift: EmployeeShiftType) => employees.filter(e => e.isActive && schedules[e.id]?.[day]?.includes(shift)).map(e => e.name).join(" • ") || "—";
  const timeLabel = (start: string, end: string) => `${displayTime(start)} – ${displayTime(end)}${end <= start ? " (اليوم التالي)" : ""}`;
  return <section className={styles.roster} aria-label="جدول الدوام للمشاركة">
    <div className={styles.rosterTitle}><div className={styles.station}><span className={styles.mark}>ف</span>محطة الفنار</div><h2>جدول الدوام الأسبوعي</h2></div>
    <table className={styles.rosterTable}><thead><tr><th scope="col">اليوم</th><th scope="col">☀ الصباحي<small>{timeLabel(settings.morningStart, settings.morningEnd)}</small></th><th scope="col">☾ المسائي<small>{timeLabel(settings.eveningStart, settings.eveningEnd)}</small></th></tr></thead>
      <tbody>{scheduleDays.map(day => <tr key={day.key}><td>{day.label}</td><td>{names(day.key, "MORNING")}</td><td>{names(day.key, "EVENING")}</td></tr>)}</tbody></table>
    <p className={styles.rosterFooter}>جدول أسبوعي متكرر • أوقات الدوام بتوقيت عمّان</p>
  </section>;
}
export function EmployeesManager({ employees, schedules, shiftSettings, wageSettings }: { employees: EmployeeView[]; schedules: Record<string, EmployeeSchedule>; shiftSettings: EmployeeShiftTimeSettings; wageSettings: { dailyWageFils: number | null } }) {
  const [people, setPeople] = useState(employees), [savedSchedules, setSavedSchedules] = useState(schedules), [drafts, setDrafts] = useState<Record<string, EmployeeSchedule>>({});
  const [times, setTimes] = useState(shiftSettings), [savedTimes, setSavedTimes] = useState(shiftSettings), [rate, setRate] = useState(wageSettings.dailyWageFils === null ? "" : (wageSettings.dailyWageFils / 1000).toFixed(3)), [savedRate, setSavedRate] = useState(wageSettings.dailyWageFils);
  const [tab, setTab] = useState("people"), [search, setSearch] = useState(""), [editor, setEditor] = useState(false), [share, setShare] = useState(false);
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
  const unsaved = Object.entries(drafts).some(([id, value]) => JSON.stringify(value) !== JSON.stringify(savedSchedules[id] ?? emptySchedule()));
  const money = (value: number) => <span className={styles.money}><bdi>{dinars(value)}</bdi> د.أ</span>;
  const shareData=useMemo(()=>buildRosterShare(people,savedSchedules,savedTimes),[people,savedSchedules,savedTimes]);
  const roster = <WeeklyRoster employees={people} schedules={savedSchedules} settings={savedTimes} />;
  const feedback = <>{error && <p role="alert" className={styles.feedback}>{error}</p>}{success && <p role="status" className={`${styles.feedback} ${styles.success}`}>{success}</p>}</>;
  return <main className={styles.page} dir="rtl">
    <header className={styles.heading}><div><h1>الموظفون وجدول الدوام</h1></div><button className={styles.primary} onClick={() => open("add")} disabled={!!busy}><AlfanarIcon name="plus" />إضافة موظف</button></header>
    {!modal && feedback}
    <nav className={styles.tabs} role="tablist" aria-label="إدارة الموظفين"><button role="tab" aria-selected={tab === "people"} onClick={() => setTab("people")}>الموظفون</button><button role="tab" aria-selected={tab === "schedule"} onClick={() => setTab("schedule")}>جدول الدوام</button><button role="tab" aria-selected={tab === "settings"} onClick={() => setTab("settings")}>اليومية وأوقات الشفتات</button></nav>
    {tab === "people" && <section className={styles.card}><div className={styles.sectionHeader}><div><h2>فريق العمل</h2><p className={styles.subtitle}>{people.filter(e => e.isActive).length} موظف فعّال • {people.length} إجمالي الموظفين</p></div><input className={styles.search} placeholder="البحث عن موظف…" aria-label="البحث عن موظف" value={search} onChange={e => setSearch(e.target.value)} /></div>
      <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>الموظف</th><th>الحالة</th><th>الإجراءات</th></tr></thead><tbody>{visible.map(e => <tr key={e.id}><td><div className={styles.person}><span className={styles.avatar}>{e.name.slice(0, 1)}</span><strong>{e.name}</strong></div></td><td><span className={e.isActive ? styles.good : styles.badge}><i className={styles.dot} />{e.isActive ? "فعّال" : "معطّل"}</span></td><td><div className={styles.actions}><button onClick={() => open("edit", e)} disabled={!!busy}>تعديل</button><button onClick={() => open("pin", e)} disabled={!!busy}><AlfanarIcon name="shield" />رمز الدخول</button><button className={e.isActive ? styles.danger : ""} onClick={() => open("status", e)} disabled={!!busy}>{e.isActive ? "تعطيل" : "تفعيل"}</button></div></td></tr>)}</tbody></table></div>{!visible.length && <p className={styles.empty}>لا يوجد موظفون مطابقون.</p>}
      <div className={styles.note}>اليومية الموحدة لليوم: {savedRate === null ? "لم تُحدد بعد" : money(savedRate)} • <button onClick={() => setTab("settings")}>تعديل اليومية</button></div>
    </section>}
    {(tab === "people" || tab === "schedule") && <section className={styles.card}><div className={styles.sectionHeader}><div><h2>جدول الدوام المحفوظ</h2></div><div className={styles.actions}><button onClick={() => { setTab("schedule"); setEditor(!editor); }} disabled={!!busy}><AlfanarIcon name="calendar" />{editor && tab === "schedule" ? "إخفاء التعديل" : "تعديل الجدول"}</button><button className={styles.primary} onClick={() => setShare(true)}><AlfanarIcon name="users" />مشاركة الجدول</button></div></div>
      {unsaved && <p className={styles.note}>تعديلات غير محفوظة.</p>}{roster}
    </section>}
    {tab === "schedule" && editor && <section className={styles.card}><div className={styles.sectionHeader}><div><h2>تعديل الدوام الأسبوعي</h2></div></div><div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>الموظف</th>{scheduleDays.map(day => <th key={day.key}>{day.label}</th>)}<th>حفظ</th></tr></thead><tbody>{people.filter(e => e.isActive).map(e => <tr key={e.id}><td><strong>{e.name}</strong></td>{scheduleDays.map(day => <td key={day.key}><select aria-label={`${e.name} — ${day.label}`} disabled={!!busy} value={option((drafts[e.id] ?? savedSchedules[e.id] ?? emptySchedule())[day.key])} onChange={event => { const value = event.target.value as Option; setDrafts(old => ({ ...old, [e.id]: { ...(old[e.id] ?? savedSchedules[e.id] ?? emptySchedule()), [day.key]: shifts(value) } })); }}><option value="REST">راحة</option><option value="MORNING">صباحي</option><option value="EVENING">مسائي</option><option value="BOTH">صباحي + مسائي</option></select></td>)}<td><button className={styles.primary} disabled={!!busy || !drafts[e.id] || JSON.stringify(drafts[e.id]) === JSON.stringify(savedSchedules[e.id] ?? emptySchedule())} onClick={() => { const draft = drafts[e.id]; void mutate("schedule", `/api/admin/employees/${e.id}/schedule`, draft, "PATCH", () => setSavedSchedules(old => ({ ...old, [e.id]: draft }))); }}>{busy === "schedule" ? "جارٍ الحفظ…" : "حفظ"}</button></td></tr>)}</tbody></table></div></section>}
    {tab === "settings" && <div className={styles.settings}>
      <section className={styles.card}><div className={styles.sectionHeader}><h2>اليومية الموحدة</h2><AlfanarIcon name="coins" /></div><div className={styles.body}><form className={styles.form} onSubmit={e => { e.preventDefault(); const value = parseDinars(rate); if (value === null) { setError(userMessage("أدخل مبلغًا صحيحًا بثلاث منازل عشرية كحد أقصى.")); return; } void mutate("wage", "/api/admin/employees/wage-settings", { dailyWageFils: value }, "PATCH", () => { setSavedRate(value); setRate((value / 1000).toFixed(3)); }); }}><label className={styles.field}><span>قيمة اليومية لليوم — بالدينار</span><input value={rate} onChange={e => setRate(e.target.value)} inputMode="decimal" placeholder="0.000" required disabled={!!busy} /></label><button className={styles.primary} disabled={!!busy}>{busy === "wage" ? "جارٍ الحفظ…" : "حفظ اليومية"}</button></form></div></section>
      <section className={styles.card}><div className={styles.sectionHeader}><h2>أوقات الشفتات</h2><AlfanarIcon name="clock" /></div><div className={styles.body}><form className={styles.form} onSubmit={e => { e.preventDefault(); void mutate("times", "/api/admin/employees/shift-settings", times, "PATCH", () => setSavedTimes({ ...times })); }}><div className={styles.formGrid}>{([ ["morningStart", "بداية الصباحي"], ["morningEnd", "نهاية الصباحي"], ["eveningStart", "بداية المسائي"], ["eveningEnd", "نهاية المسائي"] ] as const).map(([key, label]) => <label key={key} className={styles.field}><span>{label}</span><input type="time" value={times[key]} required onChange={e => setTimes(old => ({ ...old, [key]: e.target.value }))} disabled={!!busy} lang="en-GB" /></label>)}</div><div className={styles.actions}><button className={styles.primary} disabled={!!busy}>حفظ الأوقات</button><button type="button" disabled={!!busy} onClick={() => setTimes({ morningStart: "08:00", morningEnd: "16:00", eveningStart: "16:00", eveningEnd: "00:00" })}>8 صباحًا–4 عصرًا / 4 عصرًا–منتصف الليل</button></div></form></div></section>
    </div>}
    {modal && <AdminDialog title={modal.mode === "add" ? "إضافة موظف" : modal.mode === "edit" ? "تعديل الموظف" : modal.mode === "pin" ? `رمز الدخول — ${modal.employee?.name}` : `${modal.employee?.isActive ? "تعطيل" : "تفعيل"} الموظف`} busy={!!busy} onClose={() => { setModal(null); setPin(""); setError(""); }}>{feedback}<form className={styles.form} onSubmit={submitEmployee}>
      {(modal.mode === "add" || modal.mode === "edit") && <label className={styles.field}><span>اسم الموظف</span><input value={name} onChange={e => setName(e.target.value)} minLength={2} maxLength={100} autoComplete="off" name="employee-display-name" required disabled={!!busy} /></label>}
      {(modal.mode === "add" || modal.mode === "pin") && <><label className={styles.field}><span>رمز الدخول PIN</span><input value={pin} onChange={e => setPin(e.target.value)} type={showPin ? "text" : "password"} inputMode="numeric" pattern="[0-9]{4,6}" maxLength={6} autoComplete="new-password" required disabled={!!busy} /></label><label className={styles.checkLabel}><input type="checkbox" checked={showPin} onChange={e => setShowPin(e.target.checked)} />إظهار الرمز المدخل</label></>}
      {modal.mode === "status" && <p>هل تريد {modal.employee?.isActive ? "تعطيل" : "تفعيل"} دخول {modal.employee?.name}؟</p>}
      <div className={styles.actions}><button className={styles.primary} disabled={!!busy}>{busy ? "جارٍ الحفظ…" : "حفظ"}</button><button type="button" onClick={() => setModal(null)} disabled={!!busy}>رجوع</button></div></form></AdminDialog>}
    {share && <AdminDialog title="مشاركة جدول الدوام" wide onClose={() => setShare(false)}><RosterShareActions data={shareData}/><div className={styles.sharingScroll}><div className={styles.sharing}>{roster}</div></div></AdminDialog>}
  </main>;
}
