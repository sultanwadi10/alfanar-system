import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

export async function checkRosters({ db, load, check, employeeId, projectId }) {
  assert.equal(projectId, "demo-alfanar-checks");
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8180");
  const { getRosterWeek, saveRosterWeek, currentRosterTimes } = load("@/lib/employees/roster-repository");
  const { emptyRosterSchedule } = load("@/lib/employees/roster-week");
  const now = new Date("2026-11-19T10:00:00Z"), later = new Date("2026-11-28T10:00:00Z");
  const settings = { morningStart: "08:00", morningEnd: "16:00", eveningStart: "20:00", eveningEnd: "08:00" };
  const original = { ...emptyRosterSchedule(), sunday: ["MORNING"], friday: ["EVENING"] };
  await db.collection("employeeSchedules").doc(employeeId).set(original);
  await db.collection("systemSettings").doc("employeeShiftTimes").set(settings);
  const write = input => saveRosterWeek({ requestId: randomUUID(), expectedRevision: 0, settings, schedules: {}, ...input }, "roster-admin", now);
  let future;
  await check("reading a dated roster leaves existing schedules untouched", async () => {
    const week = await getRosterWeek("2026-11-14", now);
    assert.deepEqual(week.schedules[employeeId], original);
    assert.equal((await db.collection("employeeRosterWeeks").get()).size, 0);
    assert.equal((await db.collection("systemSettings").doc("employeeRosterBaseline").get()).exists, false);
    assert.deepEqual((await getRosterWeek("2026-11-21", now)).schedules, {});
  });
  const request = { weekStart: "2026-11-21", requestId: randomUUID(), schedules: { [employeeId]: { ...emptyRosterSchedule(), saturday: ["EVENING"] } } };
  await check("future save freezes current week and retry does not duplicate revision", async () => {
    future = await write(request);
    assert.equal(future.revision, 1); assert.equal((await write(request)).revision, 1);
    const current = await getRosterWeek("2026-11-14", now);
    assert.deepEqual(current.schedules[employeeId], original); assert.deepEqual(current.settings, settings);
    assert.deepEqual((await db.collection("employeeSchedules").doc(employeeId).get()).data(), original);
    await assert.rejects(write({ ...request, requestId: randomUUID() }), e => e.code === "REVISION_CONFLICT");
    await assert.rejects(write({ ...request, settings: { ...settings, morningStart: "09:00" } }), e => e.code === "REQUEST_CONFLICT");
  });
  await check("week boundary overlap rejects the entire save and preserves the existing future plan", async () => {
    await assert.rejects(write({ weekStart: future.weekStart, expectedRevision: 1, settings: { morningStart: "07:00", morningEnd: "15:00", eveningStart: "15:00", eveningEnd: "22:00" }, schedules: { [employeeId]: { ...emptyRosterSchedule(), saturday: ["MORNING"] } } }), e => e.code === "SCHEDULE_OVERLAP");
    assert.equal((await getRosterWeek("2026-11-21", now)).revision, 1);
  });
  const secondId = employeeId + "-roster";
  await db.collection("employees").doc(secondId).set({ name: "موظف ثانٍ", isActive: true });
  await check("multi-employee shifts and weekly times save atomically without changing current shift terms", async () => {
    future = await write({ ...request, requestId: randomUUID(), expectedRevision: 1, settings: { morningStart: "09:00", morningEnd: "17:00", eveningStart: "17:00", eveningEnd: "00:00" }, schedules: { ...future.schedules, [secondId]: { ...emptyRosterSchedule(), saturday: ["EVENING"] } } });
    assert.equal(future.employees.length, 2);
    assert.deepEqual(await db.runTransaction(tx => currentRosterTimes(tx, db, now)), settings);
    assert.deepEqual(await db.runTransaction(tx => currentRosterTimes(tx, db, new Date("2026-11-21T10:00:00Z"))), future.settings);
    assert.deepEqual((await db.collection("systemSettings").doc("employeeShiftTimes").get()).data(), settings);
  });
  await check("concurrent admins cannot silently overwrite the same roster revision", async () => {
    const input = { weekStart: future.weekStart, expectedRevision: future.revision, settings: future.settings, schedules: future.schedules };
    const results = await Promise.allSettled([write(input), write(input)]);
    assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
    assert.equal(results.find(r => r.status === "rejected").reason.code, "REVISION_CONFLICT");
    future = await getRosterWeek(future.weekStart, now);
  });
  await check("disabled staff cannot be newly assigned; current snapshot is preserved", async () => {
    await db.collection("employees").doc(secondId).update({ isActive: false });
    await assert.rejects(write({ weekStart: future.weekStart, expectedRevision: future.revision, settings: future.settings, schedules: { ...future.schedules, [secondId]: { ...emptyRosterSchedule(), sunday: ["MORNING"] } } }), e => e.code === "EMPLOYEE_INACTIVE");
    const preserved = await write({ weekStart: future.weekStart, expectedRevision: future.revision, settings: future.settings, schedules: future.schedules });
    assert.equal(preserved.employees.find(e => e.id === secondId).isActive, false);
    assert.deepEqual((await getRosterWeek("2026-11-14", now)).schedules[employeeId], original);
  });
  await check("Saturday rollover is not a repeating schedule; previous weeks are read-only", async () => {
    assert.deepEqual((await getRosterWeek("2026-11-28", later)).schedules, {});
    await assert.rejects(saveRosterWeek({ requestId: randomUUID(), weekStart: "2026-11-21", expectedRevision: future.revision, settings, schedules: {} }, "roster-admin", later), e => e.code === "PAST_WEEK");
    await assert.rejects(write({ weekStart: "2026-11-22" }), e => e.code === "INVALID_WEEK");
  });
}
