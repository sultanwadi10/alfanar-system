import "server-only";
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { getStoreSecurityContext } from "@/lib/security/get-store-security-context";
import { resolveOperatorSession } from "@/lib/auth/operator-session";
import { readOperationChanges } from "./operation-changes";
import { AUTH_SESSION_CONFIG } from "@/lib/auth/session-config";
import { OPERATOR_SESSION_CONFIG } from "@/lib/auth/operator-session-config";
import { STORE_DEVICE_CONFIG } from "@/lib/store/store-device-config";

type Entry = { employeeId: string | null; version: string; expires: number };
const entries = new Map<string, Entry>();
// This cache is exclusively a UI heartbeat. Business APIs never use it and
// continue to verify the live session/device/schedule before every operation.
export async function readPulseState() {
  const jar = await cookies();
  const credentials = [AUTH_SESSION_CONFIG.COOKIE_NAMES.STORE, STORE_DEVICE_CONFIG.COOKIE_NAME, OPERATOR_SESSION_CONFIG.COOKIE_NAME].map(name => jar.get(name)?.value ?? "");
  const key = createHash("sha256").update(JSON.stringify(credentials)).digest("hex");
  const prior = entries.get(key);
  let changes;
  if (prior && prior.expires > Date.now()) {
    changes = await readOperationChanges();
    if (prior.version === changes.access) return { ok: true, operatorEmployeeId: prior.employeeId, changes };
  }
  // Do not let a fabricated cookie trigger marker reads before the store gate.
  const store = await getStoreSecurityContext();
  // Bind operator validation to the observed revision. A handover that follows
  // this read invalidates the cached result at the next heartbeat.
  changes ??= await readOperationChanges();
  const operator = await resolveOperatorSession(store.authUid, { handoverOnly: true });
  const employeeId = operator?.employeeId ?? null;
  if (entries.size >= 256) {
    for (const [id, entry] of entries) if (entry.expires <= Date.now()) entries.delete(id);
    if (entries.size >= 256) entries.delete(entries.keys().next().value!);
  }
  entries.set(key, { employeeId, version: changes.access, expires: Date.now() + 60000 });
  return { ok: true, operatorEmployeeId: employeeId, changes };
}
