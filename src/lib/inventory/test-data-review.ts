import "server-only";
import { getFirebaseAdminFirestore } from "@/lib/firebase/admin";
const trialCollections = new Set(["products", "customers", "customerPhoneIndex", "directSales", "deliveryOrders", "deliveryOrderCounters", "deliveryOrderRequests", "couponBooklets", "couponBookletTransactions", "shifts", "activeStoreShifts", "inventoryItems", "inventoryPolicies", "inventoryMovements", "inventorySettings", "bottleDebtAccounts", "inventoryOperations", "inventoryUniqueKeys", "catalogEntries", "catalogAudit", "catalogServiceKeys", "employees", "employeeSchedules", "employeeDailyWages", "employeePayrollCutovers", "operatorSessions", "operatorSessionCutoffs", "employeePinAttempts", "customerReceivables", "receivableCollections", "couponTransactions", "couponBookletSales", "couponBookletSettings", "couponBookletSerialKeys", "couponBookletSerialAudit"]);
export type TrialReview = { generatedAt: string; executionAvailable: false; scope: string; rows: Array<{ collection: string; documents: number; decision: "TRIAL" | "PRESERVE" | "REVIEW" }>; notes: string[] };
export async function testDataReview(): Promise<TrialReview> {
  const db = getFirebaseAdminFirestore();
  const collections = await db.listCollections();
  const rows = [];
  // Count documents only: this endpoint neither reads customer contents nor
  // writes, deletes, or resets any data.
  for (const ref of collections) {
    const count = await ref.count().get();
    const security = /employee|user|account|auth|session|security|attempt|rateLimit|stealth|device|pairing|schedule/i.test(ref.id);
    rows.push({ collection: ref.id, documents: count.data().count, decision: trialCollections.has(ref.id) ? "TRIAL" as const : security ? "PRESERVE" as const : "REVIEW" as const });
  }
  return { generatedAt: new Date().toISOString(), executionAvailable: false, scope: "بداية كاملة: الاحتفاظ بحسابات الدخول الأساسية والأمان، وحذف بيانات الموظفين والعملاء والأصناف والعمليات التجريبية", rows: rows.sort((a, b) => a.collection.localeCompare(b.collection)), notes: ["تقرير مراجعة فقط؛ التنظيف متاح بأداة التسليم بعد النسخة الاحتياطية واعتماد المراجعة.", "الموظفون والعملاء والمبيعات والطلبات والكوبونات والشفتات والمخزون والمستحقات واليوميات ضمن بيانات التجربة.", "حسابات الدخول الأساسية والأمان والأجهزة المصرّحة تبقى محفوظة. أي مجموعة غير معروفة تحتاج مراجعة قبل التنفيذ.", "الأعداد للمستندات المباشرة فقط؛ المجموعات الفرعية وحسابات Firebase Authentication تحتاج مراجعة مستقلة عند إعداد التنفيذ.", "إعدادات النظام العامة تحتاج مراجعة لإعادة أي إشارة إلى شفت أو عملية تجريبية. يلزم إغلاق العمل الجاري ونسخة احتياطية قبل أي تنظيف فعلي."] };
}
