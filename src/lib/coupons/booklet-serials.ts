import "server-only";
import { createHash } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { getFirebaseAdminFirestore } from "@/lib/firebase/admin";
import { BookletError } from "./booklet-error";
const key = (text: string) => createHash("sha256").update(text).digest("hex");
export function physicalBookletSerial(value: string, legacy = false): string {
  const text = value.trim().toUpperCase().replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 1632)).replace(/[۰-۹]/g, c => String(c.charCodeAt(0) - 1776));
  const digits = /^(?:EX-)?(\d{1,40})$/.exec(text)?.[1];
  if (digits) { const result = digits.replace(/^0+/, "") || "0"; if (result !== "0") return result; }
  if (legacy && /^[A-Z0-9][A-Z0-9-]{0,39}$/.test(text)) return text;
  throw new BookletError("INVALID_SERIAL", "أدخل رقم الدفتر الفعلي: عدد صحيح موجب، مثل 1 أو 125.");
}
async function serialRows() {
  const snapshot = await getFirebaseAdminFirestore().collection("couponBooklets").limit(5001).get();
  if (snapshot.size > 5000) throw new BookletError("SERIAL_REVIEW_LIMIT", "عدد الدفاتر كبير؛ يلزم ترحيل الأرقام بدفعات قبل المتابعة.");
  return snapshot.docs.map(d => ({ id: d.id, before: String(d.data().serial), after: physicalBookletSerial(String(d.data().serial), true) }));
}
export async function previewBookletSerialConversion() {
  const rows = await serialRows(), groups = new Map<string, string[]>();
  for (const row of rows) groups.set(row.after, [...(groups.get(row.after) ?? []), row.before]);
  const conflicts = [...groups].filter(([, values]) => values.length > 1).map(([serial, existing]) => ({ serial, existing }));
  return { total: rows.length, changes: rows.filter(r => r.before !== r.after), conflicts };
}
export async function convertBookletSerials(adminUid: string) {
  const preview = await previewBookletSerialConversion();
  if (preview.conflicts.length) throw new BookletError("SERIAL_CONFLICT", `يوجد أكثر من دفتر سيحمل الرقم ${preview.conflicts[0].serial}. لم يبدأ التحويل؛ راجع الأرقام المتكررة أولًا.`);
  const rows = await serialRows(), db = getFirebaseAdminFirestore();
  for (let offset = 0; offset < rows.length; offset += 50) {
    const batch = rows.slice(offset, offset + 50);
    await db.runTransaction(async tx => {
      const reads = await Promise.all(batch.map(async row => ({ row, doc: await tx.get(db.collection("couponBooklets").doc(row.id)), lock: await tx.get(db.collection("couponBookletSerialKeys").doc(key(row.after))) })));
      for (const { row, doc, lock } of reads) {
        if (!doc.exists || physicalBookletSerial(String(doc.data()?.serial), true) !== row.after || (lock.exists && lock.data()?.bookletId !== row.id)) throw new BookletError("SERIAL_CHANGED", "تغيّرت بيانات الأرقام أثناء التحويل. حدّث المعاينة وأعد المحاولة.");
      }
      const now = Timestamp.now();
      for (const { row, doc } of reads) {
        tx.set(db.collection("couponBookletSerialKeys").doc(key(row.after)), { bookletId: row.id, serial: row.after });
        if (doc.data()?.serial !== row.after) {
          tx.update(doc.ref, { serial: row.after, previousSerial: doc.data()?.previousSerial ?? doc.data()?.serial, serialUpdatedAt: now });
          tx.set(db.collection("couponBookletSerialAudit").doc(key(row.id + ":" + row.after)), { bookletId: row.id, previousSerial: doc.data()?.serial, serial: row.after, adminUid, createdAt: now });
        }
      }
    });
  }
  await db.collection("couponBookletSettings").doc("serialRegistry").set({ ready: true, updatedAt: Timestamp.now(), updatedByAdminUid: adminUid });
  return { changed: preview.changes.length, processed: rows.length };
}
export async function registerCanonicalBooklet(input: string, adminUid: string) {
  const serial = physicalBookletSerial(input), db = getFirebaseAdminFirestore(), id = key(serial);
  const ref = db.collection("couponBooklets").doc(id), lockRef = db.collection("couponBookletSerialKeys").doc(id);
  return db.runTransaction(async tx => {
    const [existing, lock, registry] = await Promise.all([tx.get(ref), tx.get(lockRef), tx.get(db.collection("couponBookletSettings").doc("serialRegistry"))]);
    if (existing.exists || lock.exists) throw new BookletError("DUPLICATE_SERIAL", "رقم الدفتر مسجل مسبقًا.");
    if (registry.data()?.ready !== true) {
      const legacy = await tx.get(db.collection("couponBooklets").limit(5001));
      if (legacy.size > 5000) throw new BookletError("SERIAL_REVIEW_LIMIT", "اعتمد تحويل الأرقام الحالية أولًا.");
      if (legacy.docs.some(d => physicalBookletSerial(String(d.data().serial), true) === serial)) throw new BookletError("DUPLICATE_SERIAL", "رقم الدفتر موجود ضمن الأرقام الحالية؛ لا تضف نسخة ثانية منه.");
    }
    const now = Timestamp.now();
    tx.create(ref, { serial, status: "IN_STOCK", customerId: null, orderId: null, issuedCoupons: 22, remainingCoupons: 0, reservedCoupons: 0, createdAt: now, updatedAt: now, createdByAdminUid: adminUid });
    tx.create(lockRef, { serial, bookletId: id });
    return id;
  });
}
