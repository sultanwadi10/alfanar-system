"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlfanarIcon } from "@/components/admin/alfanar-icon";
import { RosterShareActions } from "@/components/admin/roster-share-actions";
import { buildRosterShare, rosterTime } from "@/lib/employees/roster-share";
import { addRosterDays, emptyRosterSchedule, rosterDays, rosterRangeLabel, rosterWeekStart, setRosterAssignment, validRosterDate, type RosterEmployee, type RosterWeek } from "@/lib/employees/roster-week";
import type { EmployeeShiftType, EmployeeWeekday } from "@/types/employee-schedule";
import styles from "./weekly-roster-editor.module.css";

async function loadWeek(weekStart: string, signal?: AbortSignal): Promise<RosterWeek> {
  const response = await fetch(`/api/admin/employees/roster?weekStart=${weekStart}`, { cache: "no-store", signal });
  const result = await response.json();
  if (!response.ok || result.success !== true) throw Error(result.error?.message ?? "تعذر تحميل الجدول.");
  return result.data;
}

export function WeeklyRosterEditor({ people, initialWeek }: { people: RosterEmployee[]; initialWeek: RosterWeek }) {
  const [currentWeek] = useState(() => rosterWeekStart());
  const [selected, setSelected] = useState(initialWeek.weekStart);
  const [saved, setSaved] = useState(initialWeek), [draft, setDraft] = useState(initialWeek);
  const [editing, setEditing] = useState(false), [loading, setLoading] = useState(false), [saving, setSaving] = useState(false);
  const [error, setError] = useState(""), [message, setMessage] = useState("");
  const [picker, setPicker] = useState<string | null>(null);
  const root = useRef<HTMLElement>(null), working = useRef(false);
  const pending = useRef<{ fingerprint: string; requestId: string } | null>(null);
  const ready = selected === saved.weekStart, busy = loading || saving;
  const past = selected < currentWeek;
  const employees = useMemo(() => {
    const list = new Map(saved.employees.map(e => [e.id, e]));
    if (!past) people.forEach(e => list.set(e.id, e));
    return [...list.values()];
  }, [people, saved.employees, past]);
  const share = useMemo(() => buildRosterShare(employees, saved.schedules, saved.settings, saved.weekStart), [employees, saved]);

  useEffect(() => {
    if (selected === initialWeek.weekStart) return;
    const controller = new AbortController();
    // Loading is set by the navigation handler so stale rows cannot be edited.
    loadWeek(selected, controller.signal).then(week => { setSaved(week); setDraft(week); setLoading(false); }).catch(err => {
      if (!controller.signal.aborted) { setError(err instanceof Error ? err.message : "تعذر تحميل الجدول."); setLoading(false); }
    });
    return () => controller.abort();
  }, [selected, initialWeek.weekStart]);
  useEffect(() => {
    if (!picker) return;
    const close = (event: PointerEvent) => { if (!(event.target instanceof Element) || !event.target.closest("[data-roster-picker]")) setPicker(null); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setPicker(null); };
    document.addEventListener("pointerdown", close); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", escape); };
  }, [picker]);

  function navigate(week: string) {
    if (editing || busy || week === selected) return;
    setError(""); setMessage(""); setPicker(null);
    if (week === initialWeek.weekStart) {
      // Re-fetch the current week too: another admin may have updated it.
      setLoading(true); setSelected(week);
      void loadWeek(week).then(value => { setSaved(value); setDraft(value); }).catch(err => setError(err.message)).finally(() => setLoading(false));
    } else { setLoading(true); setSelected(week); }
  }
  async function copyCurrent() {
    if (working.current || busy || selected <= currentWeek || !ready) return;
    working.current = true; setLoading(true); setError(""); setMessage("");
    try {
      const week = await loadWeek(currentWeek);
      const schedules = Object.fromEntries(people.filter(e => e.isActive).map(e => [e.id, week.schedules[e.id] ?? emptyRosterSchedule()]));
      setDraft({ ...saved, settings: week.settings, schedules }); setEditing(true);
    } catch (err) { setError(err instanceof Error ? err.message : "تعذر نسخ الجدول."); }
    finally { working.current = false; setLoading(false); }
  }
  async function save() {
    if (working.current || busy || !ready || past) return;
    working.current = true; setSaving(true); setError(""); setMessage(""); setPicker(null);
    const body = { weekStart: draft.weekStart, expectedRevision: saved.revision, settings: draft.settings, schedules: draft.schedules };
    const fingerprint = JSON.stringify(body);
    if (pending.current?.fingerprint !== fingerprint) pending.current = { fingerprint, requestId: crypto.randomUUID() };
    try {
      const response = await fetch("/api/admin/employees/roster", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, requestId: pending.current.requestId }) });
      const result = await response.json();
      if (!response.ok || result.success !== true) throw Error(result.error?.message ?? "تعذر حفظ الجدول.");
      setSaved(result.data); setDraft(result.data); setEditing(false); pending.current = null; setMessage("تم حفظ الجدول");
    } catch (err) { setError(err instanceof Error ? err.message : "تعذر الحفظ."); }
    finally { working.current = false; setSaving(false); }
  }
  function cell(day: EmployeeWeekday, label: string, shift: EmployeeShiftType) {
    const key = `${day}-${shift}`, assigned = employees.filter(e => draft.schedules[e.id]?.[day]?.includes(shift));
    return <div className={styles.cell} data-roster-picker>
      <button className={styles.assignment} type="button" disabled={!editing || busy} aria-label={`${label} — ${shift === "MORNING" ? "الصباحي" : "المسائي"}`} aria-expanded={editing ? picker === key : undefined} onClick={() => setPicker(picker === key ? null : key)}>
        <span className={styles.pills}>{assigned.length ? assigned.map(e => <span key={e.id} className={styles.pill}>{e.name}</span>) : "—"}</span>{editing && <AlfanarIcon name="chevron-down" />}
      </button>
      {editing && picker === key && <div className={styles.picker} role="group" aria-label={`موظفو ${label}`}>
        {employees.filter(e => e.isActive || assigned.some(a => a.id === e.id)).map(e => <label key={e.id}><input type="checkbox" disabled={!e.isActive || busy} checked={draft.schedules[e.id]?.[day]?.includes(shift) ?? false} onChange={event => setDraft(old => ({ ...old, schedules: setRosterAssignment(old.schedules, e.id, day, shift, event.target.checked) }))} /><span>{e.name}</span></label>)}
        {!employees.some(e => e.isActive) && <span>لا يوجد موظفون فعّالون</span>}
      </div>}
    </div>;
  }
  return <section className={styles.roster} ref={root} aria-label="جدول الدوام الأسبوعي" aria-busy={busy}>
    <div className={styles.toolbar}>
      <div className={styles.weeks}><button type="button" disabled={editing || busy} onClick={() => navigate(addRosterDays(selected, -7))} aria-label="الأسبوع السابق">→</button><select aria-label="الأسبوع" value={selected === currentWeek ? "current" : selected === addRosterDays(currentWeek, 7) ? "next" : "custom"} disabled={editing || busy} onChange={e => { if (e.target.value !== "custom") navigate(e.target.value === "current" ? currentWeek : addRosterDays(currentWeek, 7)); }}><option value="current">الأسبوع الحالي</option><option value="next">الأسبوع القادم</option>{selected !== currentWeek && selected !== addRosterDays(currentWeek, 7) && <option value="custom">أسبوع محدد</option>}</select><button type="button" disabled={editing || busy || selected >= addRosterDays(currentWeek, 364)} onClick={() => navigate(addRosterDays(selected, 7))} aria-label="الأسبوع التالي">←</button><label className={styles.date}><span dir="ltr">{rosterRangeLabel(selected)}</span><input aria-label="اختيار تاريخ الأسبوع" type="date" value={selected} max={addRosterDays(currentWeek, 364)} disabled={editing || busy} onChange={e => { if (validRosterDate(e.target.value)) navigate(rosterWeekStart(e.target.value)); }} /></label></div>
      <div className={styles.actions}>{selected > currentWeek && <button type="button" disabled={editing || busy || !ready} onClick={() => void copyCurrent()}><AlfanarIcon name="calendar" />نسخ الأسبوع الحالي</button>}{!editing && !past && <button type="button" className={styles.primary} disabled={busy || !ready} onClick={() => { setDraft(saved); setEditing(true); setError(""); setMessage(""); }}>تعديل الجدول</button>}<RosterShareActions data={share} disabled={editing || busy || !ready} /></div>
    </div>
    {error && <p role="alert" className={styles.error}>{error}</p>}{message && <p role="status" className={styles.message}>{message}</p>}
    {ready && !loading ? <><div className={styles.title}><div className={styles.station}><b>ف</b>محطة الفنار</div><h2>جدول الدوام الأسبوعي</h2></div>
      <div className={styles.table} role="table" aria-label="دوام الموظفين"><div className={styles.header} role="row"><div role="columnheader">اليوم</div>{(["MORNING", "EVENING"] as const).map(shift => {
        const key = shift === "MORNING" ? "morning" : "evening";
        return <div key={shift} role="columnheader" className={shift === "MORNING" ? styles.morning : styles.evening}><strong>{shift === "MORNING" ? "☀ الصباحي" : "☾ المسائي"}</strong>{editing ? <div className={styles.times}>{(["Start", "End"] as const).map((part, index) => <label key={part}><span>{index ? "إلى" : "من"}</span><input type="time" aria-label={`${index ? "نهاية" : "بداية"} ${shift === "MORNING" ? "الصباحي" : "المسائي"}`} required value={draft.settings[`${key}${part}`]} onChange={e => setDraft(old => ({ ...old, settings: { ...old.settings, [`${key}${part}`]: e.target.value } }))} disabled={busy} /></label>)}</div> : <small>{rosterTime(saved.settings[`${key}Start`])} – {rosterTime(saved.settings[`${key}End`])}{saved.settings[`${key}End`] <= saved.settings[`${key}Start`] ? " (اليوم التالي)" : ""}</small>}</div>;
      })}</div>{rosterDays.map((day, index) => <div className={styles.row} role="row" key={day.key}><div role="cell" className={styles.day}><strong>{day.label}</strong><span dir="ltr">{addRosterDays(selected, index).split("-").reverse().join("/")}</span></div><div role="cell">{cell(day.key, day.label, "MORNING")}</div><div role="cell">{cell(day.key, day.label, "EVENING")}</div></div>)}</div>
      {editing && <div className={styles.footer}><button type="button" className={styles.primary} disabled={busy} onClick={() => void save()}>{saving ? "جارٍ الحفظ…" : "حفظ الجدول"}</button><button type="button" disabled={busy} onClick={() => { setDraft(saved); setEditing(false); setPicker(null); setError(""); }}>إلغاء</button></div>}</> : <p className={styles.message} role="status">{loading ? "جارٍ تحميل الجدول…" : "الجدول غير متاح"}</p>}
  </section>;
}
