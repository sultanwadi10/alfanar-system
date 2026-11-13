import "server-only";
import { createHash } from "node:crypto";
export const OPERATOR_SESSION_CUTOFFS="operatorSessionCutoffs";
export function operatorSessionCutoffId(storeAuthUid:string,employeeId:string){return createHash("sha256").update(JSON.stringify([storeAuthUid,employeeId])).digest("hex");}
