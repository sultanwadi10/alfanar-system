import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
const exports={};vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../../src/lib/auth/operator-session-lifetime.ts",import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports});
const {operatorSessionExpiry,OPERATOR_SESSION_MS}=exports,now=Date.parse("2026-11-21T05:00:00Z"),hour=3600000;
test("nine fixed hours from login, including previous eight-hour sessions; no sliding lifetime",()=>{
 assert.equal(OPERATOR_SESSION_MS,9*hour);assert.equal(operatorSessionExpiry(now,now+8*hour),now+9*hour);assert.equal(operatorSessionExpiry(now,now+9*hour),now+9*hour);assert.equal(operatorSessionExpiry(now,now+12*hour),now+9*hour);
 assert.equal(operatorSessionExpiry(now,now+8*hour+1),now+9*hour);
 assert.equal(operatorSessionExpiry(now,now+hour),now+hour);assert.equal(operatorSessionExpiry(now,now),0);assert.equal(operatorSessionExpiry(NaN,now),0);
});
test("heartbeat keeps a valid cookie to its fixed deadline without extending it on later checks",async()=>{
 const deadline=new Date(Date.now()+hour).toISOString(),calls=[],state={ok:true,operatorEmployeeId:"test-staff",operatorExpiresAt:deadline};
 const module={};const require=name=>name==="next/server"?{NextResponse:{json:body=>({body,cookies:{set:(...args)=>calls.push(args)}})}}:name==="next/headers"?{cookies:async()=>({get:()=>({value:"test-token"})})}:name.includes("pulse-state")?{readPulseState:async()=>state}:name.includes("operator-session-config")?{OPERATOR_SESSION_CONFIG:{COOKIE_NAME:"test-session"}}:{isSecurityError:()=>true};
 vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../../src/app/api/pulse/route.ts",import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:module,require,process:{env:{NODE_ENV:"production"}},Date,console});
 await module.GET();await module.GET();assert.equal(calls.length,2);for(const [name,token,options] of calls){assert.equal(name,"test-session");assert.equal(token,"test-token");assert.equal(options.expires.toISOString(),deadline);assert.equal(options.httpOnly,true);assert.equal(options.secure,true);}
 state.operatorEmployeeId=null;state.operatorExpiresAt=null;await module.GET();assert.equal(calls.length,2);
});
