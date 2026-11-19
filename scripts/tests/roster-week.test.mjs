import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
const root = new URL("../../src/", import.meta.url), cache = new Map();
function load(name) {
  if (cache.has(name)) return cache.get(name);
  const exports = {};
  const require = value => { if (value === "./roster-week") return load("lib/employees/roster-week.ts"); throw Error(value); };
  const code = ts.transpileModule(readFileSync(new URL(name, root), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, require, Date, Intl }); cache.set(name, exports); return exports;
}
const { rosterWeekStart, addRosterDays, ammanCalendarDate, validRosterDate, emptyRosterSchedule, setRosterAssignment, rosterConflict } = load("lib/employees/roster-week.ts");
const { buildRosterShare } = load("lib/employees/roster-share.ts");
const settings = { morningStart: "08:00", morningEnd: "16:00", eveningStart: "20:00", eveningEnd: "08:00" };
test("roster follows Amman date and Saturday boundaries across month/year/leap day", () => {
  assert.equal(ammanCalendarDate(new Date("2026-11-20T22:00:00Z")), "2026-11-21");
  assert.equal(rosterWeekStart("2026-11-19"), "2026-11-14");
  assert.equal(rosterWeekStart("2026-11-21"), "2026-11-21");
  assert.equal(addRosterDays("2026-12-26", 7), "2027-01-02");
  assert.equal(addRosterDays("2028-02-26", 3), "2028-02-29");
  assert.equal(validRosterDate("2026-02-29"), false);
});
test("several employees may share a shift; immutable selection permits both shifts without duplicates", () => {
  const before = { a: emptyRosterSchedule() };
  let after = setRosterAssignment(before, "a", "saturday", "MORNING", true);
  after = setRosterAssignment(after, "a", "saturday", "MORNING", true);
  after = setRosterAssignment(after, "a", "saturday", "EVENING", true);
  after = setRosterAssignment(after, "b", "saturday", "MORNING", true);
  assert.equal(after.a.saturday.length, 2); assert.equal(after.b.saturday.length, 1); assert.equal(before.a.saturday.length, 0);
  assert.equal(setRosterAssignment(after, "a", "saturday", "MORNING", false).a.saturday.join(), "EVENING");
});
test("overnight Friday conflict is caught in next Saturday; touching times and different employees are allowed", () => {
  const previous = { weekStart: "2026-11-14", settings, schedules: { a: { ...emptyRosterSchedule(), friday: ["EVENING"] } } };
  const next = { weekStart: "2026-11-21", settings: { ...settings, morningStart: "07:00" }, schedules: { a: { ...emptyRosterSchedule(), saturday: ["MORNING"] } } };
  assert.equal(rosterConflict([previous, next]).day, "2026-11-21");
  assert.equal(rosterConflict([previous, { ...next, settings }]), null);
  assert.equal(rosterConflict([previous, { ...next, schedules: { b: next.schedules.a } }]), null);
});
test("text/image data have the same dated Saturday-first rows and preserve historic staff names", () => {
  const share = buildRosterShare([{ id: "a", name: "سلطان", isActive: false }], { a: { ...emptyRosterSchedule(), saturday: ["MORNING"] } }, settings, "2026-11-21");
  assert.equal(share.rows[0].day, "السبت"); assert.equal(share.rows[0].morning, "سلطان");
  assert.equal(share.rows[6].date, "2026-11-27"); assert.ok(share.text.includes("السبت 21/11")); assert.ok(share.text.includes("سلطان"));
  assert.ok(!share.text.includes("متكرر"));
});
