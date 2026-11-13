import { createHash } from "node:crypto";
import { Timestamp, GeoPoint, DocumentReference } from "firebase-admin/firestore";

export const DELETE_COLLECTIONS = new Set([
  "products", "customers", "customerPhoneIndex", "directSales", "deliveryOrders", "deliveryOrderCounters", "deliveryOrderRequests",
  "couponBooklets", "couponBookletTransactions", "couponTransactions", "couponBookletSales", "couponBookletSettings", "couponBookletSerialKeys", "couponBookletSerialAudit",
  "shifts", "activeStoreShifts", "inventoryItems", "inventoryPolicies", "inventoryMovements", "inventorySettings", "bottleDebtAccounts",
  "inventoryOperations", "inventoryUniqueKeys", "catalogEntries", "catalogAudit", "catalogServiceKeys", "employees", "employeeSchedules",
  "employeeDailyWages", "employeePayrollCutovers", "operatorSessions", "operatorSessionCutoffs", "employeePinAttempts", "customerReceivables", "receivableCollections",
]);
const PRESERVE_COLLECTIONS = new Set(["adminStealthAccessSessions", "adminStealthUnlockRateLimits", "storeStealthAccessSessions", "storeStealthUnlockRateLimits", "storeDevices", "storeDevicePairingCodes", "storeDevicePairingRateLimits"]);
export function decision(path) {
  const [collection, document] = path.split("/");
  if (DELETE_COLLECTIONS.has(collection)) return "DELETE";
  if (PRESERVE_COLLECTIONS.has(collection)) return "PRESERVE";
  if (collection === "systemSettings") {
    if (["employeeWage", "employeeShiftTimes"].includes(document)) return "DELETE";
    if (["storeRuntime", "operationChanges"].includes(document)) return "PRESERVE";
  }
  return "REVIEW";
}
export function encode(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return ["value", value];
  if (typeof value === "number") return ["number", Number.isFinite(value) ? value : String(value)];
  if (value instanceof Timestamp) return ["timestamp", value.seconds, value.nanoseconds];
  if (value instanceof GeoPoint) return ["geopoint", value.latitude, value.longitude];
  if (value instanceof DocumentReference) return ["reference", value.path];
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return ["bytes", Buffer.from(value).toString("base64")];
  if (Array.isArray(value)) return ["array", value.map(encode)];
  if (value && Object.getPrototypeOf(value) === Object.prototype) return ["map", Object.keys(value).sort().map(key => [key, encode(value[key])])];
  throw Error("نوع بيانات غير مدعوم في النسخة الاحتياطية؛ لم يُحذف شيء.");
}
export function decode(value, db) {
  const [type, payload, extra] = value;
  if (type === "value") return payload;
  if (type === "number") return typeof payload === "number" ? payload : Number(payload);
  if (type === "timestamp") return new Timestamp(payload, extra);
  if (type === "geopoint") return new GeoPoint(payload, extra);
  if (type === "reference") return db.doc(payload);
  if (type === "bytes") return Buffer.from(payload, "base64");
  if (type === "array") return payload.map(entry => decode(entry, db));
  if (type === "map") return Object.fromEntries(payload.map(([key, entry]) => [key, decode(entry, db)]));
  throw Error("صيغة النسخة الاحتياطية غير مدعومة.");
}
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
}
export const fingerprint = value => createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
export function legacyPhoneAccount(account) {
  return account.principalType === "UNKNOWN" && !account.email && /^\+[1-9]\d{6,14}$/.test(account.phoneNumber ?? "") && account.providers?.length === 1 && account.providers[0] === "phone" && Object.keys(account.claims ?? {}).length === 0;
}
export const backupGuard = backup => fingerprint({ projectId: backup.projectId, digest: backup.digest, accounts: [...backup.accounts].sort((a,b)=>a.uid.localeCompare(b.uid)) });
export async function snapshotDatabase(db) {
  const rows = [];
  async function visit(collection, depth) {
    if (depth > 20) throw Error("توجد بيانات متداخلة تحتاج مراجعة مستقلة.");
    const refs = await collection.listDocuments();
    for (let offset = 0; offset < refs.length; offset += 100) {
      const group = refs.slice(offset, offset + 100), docs = await db.getAll(...group);
      for (let i = 0; i < group.length; i++) {
        if (docs[i].exists) {
          rows.push({ path: group[i].path, updateTime: encode(docs[i].updateTime), data: encode(docs[i].data()) });
          if (rows.length > 20000) throw Error("حجم البيانات يحتاج آلية تنظيف منفصلة؛ لم يُحذف شيء.");
        }
        // listDocuments also includes missing parents that contain subcollections.
        for (const child of await group[i].listCollections()) await visit(child, depth + 1);
      }
    }
  }
  for (const collection of await db.listCollections()) await visit(collection, 0);
  return rows.sort((a, b) => a.path.localeCompare(b.path, "en"));
}
export function makePlan(projectId, documents) {
  if (!/^[a-z][a-z0-9-]{4,62}$/.test(projectId)) throw Error("معرّف مشروع Firebase غير صالح.");
  const rows = documents.map(row => ({ ...row, action: decision(row.path) }));
  const summary = Object.fromEntries(["DELETE", "PRESERVE", "REVIEW"].map(action => [action, rows.filter(row => row.action === action).length]));
  return { projectId, rows, summary, digest: fingerprint({ projectId, rows }) };
}
export function verifyBackup(backup, projectId) {
  if (backup.format !== "alfanar-delivery-reset-v2" || backup.projectId !== projectId) throw Error("النسخة الاحتياطية لا تطابق المشروع الحالي أو تحتاج تحديث المراجعة.");
  const plan = makePlan(projectId, backup.documents);
  if (plan.digest !== backup.digest) throw Error("تغيّر محتوى النسخة الاحتياطية؛ أُوقف التنفيذ.");
  if (backup.guard !== backupGuard(backup)) throw Error("تغيّرت مراجعة حسابات الدخول؛ أُوقف التنفيذ.");
  if (plan.summary.REVIEW) throw Error("توجد مجموعات غير مصنفة. يجب مراجعتها قبل الحذف.");
  if (!backup.accounts?.some(account => !account.disabled && account.principalType === "ADMIN_ACCOUNT") || !backup.accounts?.some(account => !account.disabled && account.principalType === "STORE_ACCOUNT")) throw Error("لم يتم التحقق من حسابات الدخول الأساسية.");
  if (backup.accounts.some(account => ["ADMIN_ACCOUNT", "STORE_ACCOUNT"].includes(account.principalType) ? account.action !== "PRESERVE" : !(account.action === "DELETE_PHONE" && legacyPhoneAccount(account)))) throw Error("توجد حسابات دخول إضافية تحتاج مراجعة مستقلة.");
  if (new Set(backup.accounts.map(account=>account.uid)).size !== backup.accounts.length) throw Error("توجد معرّفات حسابات مكررة في المراجعة.");
  return plan;
}
export async function deletePreparedDocuments(db, plan, onProgress = async () => {}) {
  const targets = new Map(plan.rows.filter(row => row.action === "DELETE").map(row => [row.path, row]));
  let removed = 0;
  // Each pass rejects new or edited trial documents. All application servers
  // must remain stopped throughout this one-time maintenance operation.
  while (true) {
    const current = await snapshotDatabase(db);
    const remaining = [];
    for (const row of current) {
      const action = decision(row.path);
      if (action === "REVIEW") throw Error("ظهرت بيانات غير مصنفة أثناء التنفيذ. أُوقف التنظيف.");
      if (action !== "DELETE") continue;
      const original = targets.get(row.path);
      if (!original || fingerprint(original.data) !== fingerprint(row.data) || fingerprint(original.updateTime) !== fingerprint(row.updateTime)) throw Error("تغيّرت بيانات التجربة. أوقف استخدام النظام وأعد تجهيز نسخة احتياطية.");
      remaining.push(row);
    }
    if (!remaining.length) return removed;
    const batch = db.batch(), group = remaining.sort((a,b) => b.path.split("/").length-a.path.split("/").length).slice(0, 350);
    for (const row of group) batch.delete(db.doc(row.path), { lastUpdateTime: decode(row.updateTime, db) });
    await batch.commit(); removed += group.length;
    await onProgress({ removed, remaining: remaining.length - group.length });
  }
}
