import assert from "node:assert/strict";
import { configurePreview } from "./env.mjs";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
configurePreview();
const base="http://127.0.0.1:3100";
for(let attempt=0;attempt<60;attempt++){try{const r=await fetch(base);if(r.status===200)break;}catch{}if(attempt===59)throw Error("Preview server did not become ready");await new Promise(r=>setTimeout(r,1000));}
const app=initializeApp({projectId:"demo-alfanar-preview"},"http-smoke");
const login=await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-preview-key",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:"admin@preview.test",password:"Preview123!",returnSecureToken:true})}).then(r=>r.json());
assert.ok(login.idToken,"Demo admin login works");
const cookie=await getAuth(app).createSessionCookie(login.idToken,{expiresIn:3600000});
for(const route of ["/preview","/admin","/admin/orders/new?customerId=preview-customer","/admin/customers/preview-customer","/admin/receivables","/api/admin/dashboard?period=shift","/api/admin/customers/preview-customer/receivables","/api/admin/receivables"]){const response=await fetch(base+route,{headers:{Cookie:`alfanar_admin_session=${cookie}`},redirect:"manual"});assert.equal(response.status,200,route);console.log("HTTP PASS",route);}
for(const route of ["/admin/test-data-review","/api/admin/test-data-review"]){const response=await fetch(base+route,{headers:{Cookie:`alfanar_admin_session=${cookie}`},redirect:"manual"});assert.equal(response.status,307,route);assert.equal(new URL(response.headers.get("location"),base).pathname,"/");console.log("HTTP PASS removed",route);}
const denied=await fetch(base+"/api/admin/receivables");assert.equal(denied.status,401);
console.log("HTTP smoke checks passed, including protected routes and removed trial report.");await app.delete();
