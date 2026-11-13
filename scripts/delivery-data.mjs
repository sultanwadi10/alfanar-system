import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "node:process";
import { randomUUID } from "node:crypto";
import { cert, initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { snapshotDatabase, makePlan, verifyBackup, deletePreparedDocuments, legacyPhoneAccount, backupGuard, fingerprint } from "./delivery-data-core.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), args = process.argv.slice(2), mode = args[0];
const option = name => { const i = args.indexOf(name); return i === -1 ? undefined : args[i + 1]; };
const insideProject = candidate => { const relative = path.relative(fs.realpathSync(root), candidate); return relative === "" || (!relative.startsWith(".." + path.sep) && relative !== ".." && !path.isAbsolute(relative)); };
function save(file, value) {
  const temp = file + ".tmp"; fs.writeFileSync(temp, JSON.stringify(value, null, 2), { mode: 0o600 }); fs.renameSync(temp, file);
}
function accountRecord(user, legacyUids = []) {
  const row = { uid: user.uid, disabled: !!user.disabled, principalType: user.customClaims?.principalType ?? "UNKNOWN", email: user.email ?? null, phoneNumber: user.phoneNumber ?? null, displayName: user.displayName ?? null, providers: user.providerData.map(provider=>provider.providerId).sort(), claims: user.customClaims ?? {} };
  return {...row,action:["ADMIN_ACCOUNT","STORE_ACCOUNT"].includes(row.principalType)?"PRESERVE":legacyUids.includes(row.uid)&&legacyPhoneAccount(row)?"DELETE_PHONE":"REVIEW"};
}
async function accounts(auth, legacyUids = []) {
  const rows = []; let token;
  do { const page = await auth.listUsers(1000, token); rows.push(...page.users.map(user => accountRecord(user, legacyUids))); token = page.pageToken; } while (token);
  return rows;
}
let app;
try {
  if (!["prepare", "reset"].includes(mode)) throw Error("استخدم data:prepare أولًا. لا يوجد حذف تلقائي.");
  loadEnvFile(path.join(root, ".env.local"));
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  if (!projectId || projectId !== process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) throw Error("مشروع الإدارة لا يطابق مشروع التطبيق. أُوقف التنفيذ.");
  if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) throw Error("وضع المحاكاة غير مدعوم في أداة تجهيز التسليم.");
  app = initializeApp({ credential: cert({ projectId, clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n") }), projectId }, "delivery-data-maintenance");
  const db = getFirestore(app), auth = getAuth(app);
  if (mode === "prepare") {
    const [documents, preservedAccounts] = await Promise.all([snapshotDatabase(db), accounts(auth,option("--legacy-phone-user")?[option("--legacy-phone-user")]:[])]), plan = makePlan(projectId, documents);
    const parent = path.join(path.dirname(root), "alfanar-private-backups"); fs.mkdirSync(parent, { recursive: true });
    if (insideProject(fs.realpathSync(parent))) throw Error("يجب أن تبقى النسخة الاحتياطية خارج مجلد المشروع.");
    fs.writeFileSync(path.join(parent, ".gitignore"), "*\n", { mode: 0o600 });
    const folder = path.join(parent, new Date().toISOString().replace(/[:.]/g, "-") + "-delivery-reset"); fs.mkdirSync(folder);
    const backup = { format: "alfanar-delivery-reset-v2", projectId, createdAt: new Date().toISOString(), digest: plan.digest, accounts: preservedAccounts, documents };
    backup.guard = backupGuard(backup);
    save(path.join(folder, "backup.json"), backup);
    const summary = { projectId, createdAt: backup.createdAt, summary: plan.summary, accounts: {preserve:preservedAccounts.filter(account=>account.action==="PRESERVE").length,removePhone:preservedAccounts.filter(account=>account.action==="DELETE_PHONE").length,review:preservedAccounts.filter(account=>account.action==="REVIEW").length}, collections: [...new Set(plan.rows.map(row => row.path.split("/")[0]))].map(collection => ({ collection, remove: plan.rows.filter(row => row.path.startsWith(collection + "/") && row.action === "DELETE").length, preserve: plan.rows.filter(row => row.path.startsWith(collection + "/") && row.action === "PRESERVE").length, review: plan.rows.filter(row => row.path.startsWith(collection + "/") && row.action === "REVIEW").length })) };
    save(path.join(folder, "review.json"), summary);
    let blocked = ""; try { verifyBackup(backup, projectId); } catch(error) { blocked = error.message; }
    console.log(JSON.stringify({ ...summary, backupFolder: folder, ready: !blocked, blocked, confirmation: `RESET ${projectId} ${backup.guard.slice(0, 12)}` }, null, 2));
    console.log("تم تجهيز النسخة والمراجعة فقط. لم يُحذف أو يُعدّل أي مستند في Firebase.");
  } else {
    const backupPath = option("--backup");
    if (!backupPath || !args.includes("--servers-stopped")) throw Error("يلزم تحديد النسخة الاحتياطية وإيقاف جميع خوادم التطبيق قبل التنظيف.");
    const absolute = fs.realpathSync(path.resolve(backupPath));
    if (insideProject(absolute)) throw Error("النسخة الاحتياطية يجب أن تكون خارج مجلد المشروع.");
    const backup = JSON.parse(fs.readFileSync(absolute, "utf8")), plan = verifyBackup(backup, projectId), confirmation = `RESET ${projectId} ${backup.guard.slice(0, 12)}`;
    if (option("--confirm") !== confirmation) throw Error("عبارة اعتماد التنظيف غير مطابقة للمراجعة.");
    const journal = path.join(path.dirname(absolute), "reset-state.json"), state = fs.existsSync(journal) ? JSON.parse(fs.readFileSync(journal, "utf8")) : null;
    if (state && (state.digest !== plan.digest || state.guard !== backup.guard)) throw Error("سجل التنفيذ لا يطابق النسخة الاحتياطية.");
    if (state?.status === "COMPLETE") { console.log("هذه النسخة أُنجز تنظيفها سابقًا؛ لم يتكرر الحذف."); }
    else {
      const currentAccounts = await accounts(auth,backup.accounts.filter(account=>account.action==="DELETE_PHONE").map(account=>account.uid)), approvedAccounts = new Map(backup.accounts.map(account=>[account.uid,account]));
      if (currentAccounts.some(account=>!approvedAccounts.has(account.uid)||fingerprint(account)!==fingerprint(approvedAccounts.get(account.uid))) || backup.accounts.some(account=>!currentAccounts.some(current=>current.uid===account.uid)&&!(state?.status==="FINALIZING"&&account.action==="DELETE_PHONE"))) throw Error("تغيّرت حسابات الدخول منذ إعداد النسخة. أعد المراجعة أولًا.");
      if (!state) {
        const fresh = makePlan(projectId, await snapshotDatabase(db));
        const deleted = p => p.rows.filter(row => row.action === "DELETE").map(({path,data,updateTime})=>({path,data,updateTime}));
        if (JSON.stringify(deleted(fresh)) !== JSON.stringify(deleted(plan)) || fresh.summary.REVIEW) throw Error("تغيّرت البيانات منذ إعداد النسخة. أعد data:prepare أولًا.");
      }
      if (state?.status !== "FINALIZING") {
        save(journal, { digest: plan.digest, guard:backup.guard, projectId, status: "APPLYING", startedAt: new Date().toISOString() });
        await deletePreparedDocuments(db, plan, async progress => { save(journal, { digest: plan.digest, guard:backup.guard, projectId, status: "APPLYING", ...progress }); console.log(`المتبقي للتنظيف: ${progress.remaining}`); });
        save(journal, { digest: plan.digest, guard:backup.guard, projectId, status: "FINALIZING" });
      } else {
        const changed = (await snapshotDatabase(db)).filter(row => ["DELETE","REVIEW"].includes(makePlan(projectId,[row]).rows[0].action) && row.path !== "inventorySettings/main");
        if (changed.length) throw Error("ظهرت بيانات أثناء إنهاء التنظيف. أُوقف التنفيذ للمراجعة.");
      }
      for (const account of backup.accounts.filter(account=>account.action==="DELETE_PHONE")) {
        let current;
        try { current=accountRecord(await auth.getUser(account.uid),[account.uid]); } catch(error) { if(error.code==="auth/user-not-found")continue;throw error; }
        if (!legacyPhoneAccount(current)||fingerprint(current)!==fingerprint(account)) throw Error("تغيّر حساب الهاتف المحدد. أُوقف حذفه للمراجعة.");
        await auth.deleteUser(account.uid);
      }
      // Inventory tracking is operational configuration, not a test balance.
      // Keep it enabled; new items start at zero and require real opening stock.
      const batch = db.batch(), now = Timestamp.now();
      batch.set(db.collection("inventorySettings").doc("main"), { active: true, updatedAt: now });
      batch.set(db.collection("systemSettings").doc("operationChanges"), Object.fromEntries(["orders","catalog","inventory","home","access"].map(key => [key, randomUUID()])), { merge: true });
      await batch.commit();
      save(journal, { digest: plan.digest, guard:backup.guard, projectId, status: "COMPLETE", completedAt: new Date().toISOString() });
      console.log("اكتمل تنظيف بيانات التجربة. بقيت حسابات الدخول والأجهزة المصرّحة وإعدادات الأمان. أعد تشغيل التطبيق لإدخال البيانات الحقيقية.");
    }
  }
} catch(error) { console.error(error instanceof Error ? error.message : "تعذّر تجهيز بيانات التسليم."); process.exitCode = 1; }
finally { if(app) await deleteApp(app); }
