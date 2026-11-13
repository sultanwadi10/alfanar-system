import "server-only";
import { randomUUID } from "node:crypto";
import { setTimeout, clearTimeout } from "node:timers";
import { getFirebaseAdminFirestore } from "@/lib/firebase/admin";

export type ChangeChannel = "orders" | "catalog" | "inventory" | "home" | "access";
export type OperationChanges = Record<ChangeChannel, string>;
const channels: ChangeChannel[] = ["orders", "catalog", "inventory", "home", "access"];
const empty = (): OperationChanges => ({ orders: "0", catalog: "0", inventory: "0", home: "0", access: "0" });
let cached: { value: OperationChanges; expires: number } | undefined;
let pending: Promise<OperationChanges> | undefined;
let generation = 0;
const reference = () => getFirebaseAdminFirestore().collection("systemSettings").doc("operationChanges");
async function publishWithTimeout(patch: Record<string, string>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      reference().set(patch, { merge: true }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error("Notification timeout")), 1500); }),
    ]);
  } finally { if (timer !== undefined) clearTimeout(timer); }
}

// Only opaque change markers are shared, never sessions, prices or customer data.
export async function readOperationChanges(): Promise<OperationChanges> {
  if (cached && cached.expires > Date.now()) return { ...cached.value };
  if (pending) return { ...await pending };
  const started = generation;
  const request = reference().get().then(snapshot => {
    const data = snapshot.data(), value = empty();
    for (const channel of channels) if (typeof data?.[channel] === "string") value[channel] = data[channel];
    if (generation === started) cached = { value, expires: Date.now() + 5000 };
    return value;
  });
  pending = request;
  try { return { ...await request }; }
  finally { if (pending === request) pending = undefined; }
}

export async function publishOperationChanges(changed: readonly ChangeChannel[]): Promise<void> {
  const version = randomUUID(), patch = Object.fromEntries([...new Set(changed)].map(channel => [channel, version]));
  ++generation; cached = undefined; pending = undefined;
  // Publishing follows the business commit. It must never turn an already
  // committed payment into an apparent failure. Clients also reconcile on a timer.
  for (let attempt = 0; attempt < 2; attempt++) {
    try { await publishWithTimeout(patch); ++generation; cached = undefined; pending = undefined; return; }
    catch (error) { if (attempt === 1) console.error("Operation change notification failed", error); }
  }
}

export function withOperationChanges<Args extends unknown[], Result extends Response>(
  handler: (...args: Args) => Promise<Result>, changed: readonly ChangeChannel[],
): (...args: Args) => Promise<Result> {
  return async (...args) => {
    const response = await handler(...args);
    if (response.ok) await publishOperationChanges(changed);
    return response;
  };
}
