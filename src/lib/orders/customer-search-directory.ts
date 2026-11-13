import "server-only";
import { getFirebaseAdminFirestore } from "@/lib/firebase/admin";
const LIMIT = 3000;
type Directory = { rows: Array<{ id: string; name: string; phone: string }>; partial: boolean };
let cached: { value: Directory; expires: number } | undefined;
let pending: Promise<Directory> | undefined;
let generation = 0;
export function invalidateCustomerSearchDirectory() { ++generation; cached = undefined; pending = undefined; }
// A bounded, projected customer directory avoids scanning order history or
// re-reading the customer list on every search. Includes archived customers.
export async function customerSearchDirectory(fresh = false): Promise<Directory> {
  if (fresh) invalidateCustomerSearchDirectory();
  if (cached && cached.expires > Date.now()) return cached.value;
  if (pending) return pending;
  const started = generation;
  const request = getFirebaseAdminFirestore().collection("customers").select("name", "phoneNormalized").limit(LIMIT + 1).get().then(snapshot => {
    const value = {
      rows: snapshot.docs.slice(0, LIMIT).map(doc => ({ id: doc.id, name: String(doc.data().name ?? ""), phone: String(doc.data().phoneNormalized ?? "") })),
      partial: snapshot.size > LIMIT,
    };
    if (started === generation) cached = { value, expires: Date.now() + 300000 };
    return value;
  });
  pending = request;
  try { return await request; } finally { if (pending === request) pending = undefined; }
}
