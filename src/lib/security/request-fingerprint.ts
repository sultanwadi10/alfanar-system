import "server-only";
import { isIP } from "node:net";
// Only the hosting proxy may supply client identity. User-Agent is attacker-controlled.
export function trustedRequestFingerprint(request:Request,scope:string){
 const forwarded=process.env.VERCEL==="1"?request.headers.get("x-vercel-forwarded-for"):null;
 const candidate=forwarded?.split(",")[0]?.trim();
 return scope+":"+(candidate&&isIP(candidate)!==0?candidate:"local");
}
