import { checkSettlements } from "./settlement-operational.mjs";
import { checkShiftOpening } from "./shift-opening-operational.mjs";
import { checkRosters } from "./roster-operational.mjs";
import assert from "node:assert/strict";
import { readFileSync,existsSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import vm from "node:vm";
import ts from "typescript";
import { configurePreview } from "../preview/env.mjs";
configurePreview();
const root=path.resolve(import.meta.dirname,"../.."),nativeRequire=createRequire(import.meta.url),cache=new Map(),cookies=new Map();
function load(file){
  let resolved=file.startsWith("@/")?path.join(root,"src",file.slice(2)):file;
  if(!path.extname(resolved))resolved+=".ts";
  if(cache.has(resolved))return cache.get(resolved).exports;
  const loadedModule={exports:{}};cache.set(resolved,loadedModule);
  const code=ts.transpileModule(readFileSync(resolved,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const require=(name)=>{if(name==="server-only")return {};if(name==="next/headers")return {cookies:async()=>({get:key=>cookies.has(key)?{value:cookies.get(key)}:undefined})};if(name.startsWith("@/"))return load(name);if(name.startsWith(".")){const p=path.resolve(path.dirname(resolved),name);return load(existsSync(p)?p:p+".ts");}return nativeRequire(name);};
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`,{filename:resolved})(require,loadedModule,loadedModule.exports);return loadedModule.exports;
}
const testProject="demo-alfanar-checks";
if(process.env.OPERATIONAL_EMULATOR_HOST!=="127.0.0.1:8180")throw Error("Start the dedicated operational emulator on 8180; never use personal preview data.");
process.env.FIRESTORE_EMULATOR_HOST="127.0.0.1:8180";
const {initializeApp}=nativeRequire("firebase-admin/app");
const {getFirestore,getAuth}= {getFirestore:nativeRequire("firebase-admin/firestore").getFirestore,getAuth:nativeRequire("firebase-admin/auth").getAuth};
const testApp=initializeApp({projectId:testProject},"operational-checks"),db=getFirestore(testApp);
cache.set(path.join(root,"src/lib/firebase/admin.ts"),{exports:{getFirebaseAdminFirestore:()=>db,getFirebaseAdminAuth:()=>getAuth(testApp)}});
await db.collection("inventorySettings").doc("main").set({active:true});
const {Timestamp}=nativeRequire("firebase-admin/firestore");
const {startShift,closeShift}=load("@/lib/shifts/shift-repository");
const {createDeliveryOrder}=load("@/lib/orders/delivery-order-repository");
const {createDeliveryOrderSchema}=load("@/lib/orders/delivery-order-validation");
const {changeEmployeeOrderStatus}=load("@/lib/orders/delivery-order-operations");
const {changeAdminDeliveryOrderStatus}=load("@/lib/orders/admin-delivery-orders");
const {customerAccount,settleReceivable}=load("@/lib/receivables/service");
const {correctOrderPayment}=load("@/lib/receivables/payment-correction");
const {getDashboardOverview}=load("@/lib/admin/dashboard-overview");
const {deliveryPaymentPlan}=load("@/lib/orders/payment-plan");
const prefix="test-"+randomUUID(),storeAuthUid=prefix,employeeId=prefix+"-employee",customerId=prefix+"-customer",productId=prefix+"-refill",bottleId=prefix+"-bottle",goodsId=prefix+"-goods",bookId=prefix+"-book";
const actor={storeAuthUid,employeeId,employeeName:"اختبار آلي"},now=Timestamp.now();
async function set(collection,id,data){await db.collection(collection).doc(id).set(data);}
async function data(collection,id){return (await db.collection(collection).doc(id).get()).data();}
let checks=0;async function check(name,fn){await fn();checks++;console.log("PASS",name);}
await set("customers",customerId,{name:"عميل اختبار آلي",phoneNormalized:"+962790000009",primaryAddress:"عنوان اختبار فقط",isArchived:false});
await set("employees",employeeId,{name:actor.employeeName,isActive:true,authVersion:0,createdAt:now,updatedAt:now});
await set("products",productId,{name:"تعبئة اختبار",category:"REFILL",isActive:true,showForEmployee:true,isDeleted:false,requiresBottleOrigin:true,deliveryPriceFils:500,bottleSizeMl:20000});
await set("products",goodsId,{name:"أكواب اختبار",category:"CUPS",isActive:true,showForEmployee:true,isDeleted:false,requiresBottleOrigin:false,deliveryPriceFils:1000});
for(const [id,kind] of [[bottleId,"BOTTLE_POOL"],[goodsId,"GOODS"]])await set("inventoryItems",id,{code:id,name:id,kind,origin:"JORDANIAN",room:100,cooler:0,reservedRoom:0,reservedCooler:0,out:0,owed:0,review:0,active:true,unitsPerPack:1,baseUnit:"وحدة",packLabel:"وحدة",lowStock:0});
await set("inventoryPolicies",productId,{mode:"REFILL",autoBottlePools:false,bottleSizeMl:20000,consumables:[],pools:[{origin:"JORDANIAN",itemId:bottleId,quantity:1}]});
await set("inventoryPolicies",goodsId,{mode:"STOCK",itemId:goodsId,unitsPerSale:1,location:"ROOM"});
await set("couponBooklets",bookId,{customerId,status:"ACTIVE",remainingCoupons:2,reservedCoupons:0,createdAt:now,activatedAt:now});
await set("customerPrivateBottles",customerId,{rows:[{origin:"JORDANIAN",sizeMl:20000,owned:2,atStore:0,reserved:0}]});
let shift;
await check("open chosen evening shift before schedule and reject overlapping employee",async()=>{shift=await startShift({...actor,shiftType:"EVENING"});assert.equal((await data("shifts",shift.id)).shiftTimeSnapshot.shiftType,"EVENING");assert.equal((await startShift(actor)).id,shift.id);await assert.rejects(startShift({...actor,employeeId:"other"}));});
await check("session remains usable beyond advisory schedule, revoked PIN stays blocked",async()=>{const {createOperatorSession,resolveOperatorSession}=load("@/lib/auth/operator-session");const token=await createOperatorSession(storeAuthUid,{id:employeeId,name:actor.employeeName,isActive:true,authVersion:0});cookies.set("alfanar_operator_session",token.token);assert.ok(await resolveOperatorSession(storeAuthUid));await db.collection("employees").doc(employeeId).update({authVersion:1});assert.equal(await resolveOperatorSession(storeAuthUid),null);await db.collection("employees").doc(employeeId).update({authVersion:0});});
function input(method="COUPON",quantity=3,personal=2,other=false){return createDeliveryOrderSchema.parse({requestId:randomUUID(),customerId,address:"عنوان تجريبي مكتمل",notes:"",paymentMethod:method,remainderMethod:"CASH",newBookletRequested:false,items:[{productId,quantity,bottleOrigin:"JORDANIAN",personalBottleQuantity:personal,storeBottleShortageConfirmed:true},...(other?[{productId:goodsId,quantity:1,bottleOrigin:null}]:[])]});}
let mixed,request=input();
await check("shortage requires acknowledgement; client cannot forge the automatically assigned private quantity",async()=>{const withoutConsent=input();withoutConsent.items[0].storeBottleShortageConfirmed=false;await assert.rejects(createDeliveryOrder(withoutConsent,actor),error=>error.code==="PRIVATE_BOTTLES_SHORTAGE");request.items[0].personalBottleQuantity=0;request.items[0].expectedPrivateBottleQuantity=2;const stale=input("CASH",1,0);stale.items[0].expectedPrivateBottleQuantity=0;await assert.rejects(createDeliveryOrder(stale,actor),error=>error.code==="PRIVATE_BOTTLES_CHANGED");});
await check("two coupons plus cash for third refill; personal bottles never reserve shop stock",async()=>{mixed=await createDeliveryOrder(request,actor);const order=await data("deliveryOrders",mixed.orderId);assert.equal(order.couponQuantity,2);assert.equal(order.moneyDueFils,500);assert.equal(order.pendingCouponQuantity,0);assert.equal((await data("inventoryItems",bottleId)).reservedRoom,1);assert.equal((await data("customerPrivateBottles",customerId)).rows[0].reserved,2);assert.equal((await createDeliveryOrder(request,actor)).orderId,mixed.orderId);});
await check("deliver mixed order atomically; only shop bottle becomes debt; retry has no extra effect",async()=>{await changeEmployeeOrderStatus(mixed.orderId,"READY",actor,false);await changeEmployeeOrderStatus(mixed.orderId,"DELIVERED",actor,true,[{itemId:bottleId,quantity:0}]);await changeEmployeeOrderStatus(mixed.orderId,"DELIVERED",actor,true,[{itemId:bottleId,quantity:0}]);assert.equal((await data("shifts",shift.id)).cashSalesFils,500);assert.equal((await data("couponBooklets",bookId)).remainingCoupons,0);assert.equal((await data("customerPrivateBottles",customerId)).rows[0].owned,2);assert.equal((await data("customerPrivateBottles",customerId)).rows[0].reserved,0);const debts=await db.collection("bottleDebtAccounts").where("customerId","==",customerId).get();assert.equal(debts.docs[0].data().quantity,1);});
await check("prepared cancellation releases coupons and private bottles, physical stock goes to review exactly once",async()=>{const order=await createDeliveryOrder(input("CASH",1,1,true),actor);await changeEmployeeOrderStatus(order.orderId,"READY",actor,false);const before=await data("inventoryItems",goodsId);await changeEmployeeOrderStatus(order.orderId,"CANCELLED",actor,false);await changeEmployeeOrderStatus(order.orderId,"CANCELLED",actor,false);const after=await data("inventoryItems",goodsId);assert.equal(after.reservedRoom,0);assert.equal(after.review,before.review+1);assert.equal((await data("customerPrivateBottles",customerId)).rows[0].reserved,0);await assert.rejects(changeEmployeeOrderStatus(mixed.orderId,"CANCELLED",actor,false));});
await check("correction coupon to cash restores coupons and only adds cash difference; duplicate correction is idempotent",async()=>{const correction={customerId,orderId:mixed.orderId,requestId:randomUUID(),method:"CASH",remainderMethod:"CASH",expectedMoneyDueFils:1500,expectedCouponQuantity:0,adminUid:"preview-admin"};await correctOrderPayment(correction);await correctOrderPayment(correction);assert.equal((await data("couponBooklets",bookId)).remainingCoupons,2);assert.equal((await data("shifts",shift.id)).cashSalesFils,1500);await correctOrderPayment({...correction,requestId:randomUUID(),method:"COUPON",expectedMoneyDueFils:500,expectedCouponQuantity:2});assert.equal((await data("shifts",shift.id)).cashSalesFils,500);assert.equal((await data("couponBooklets",bookId)).remainingCoupons,0);await correctOrderPayment({...correction,requestId:randomUUID()});assert.equal((await data("couponBooklets",bookId)).remainingCoupons,2);});
await check("mixed non-refill goods stay payable in cash",async()=>{const order=await createDeliveryOrder(input("COUPON",1,0,true),actor);const v=await data("deliveryOrders",order.orderId);assert.equal(v.couponQuantity,1);assert.equal(v.moneyDueFils,1000);await changeEmployeeOrderStatus(order.orderId,"CANCELLED",actor,false);});
let deferred;
await check("deferred delivery opens money receivable and partial collections update active cash",async()=>{deferred=await createDeliveryOrder(input("CASH",2,2),actor);await changeEmployeeOrderStatus(deferred.orderId,"READY",actor,false);await changeEmployeeOrderStatus(deferred.orderId,"DELIVERED",actor,false,[],[],true);assert.equal((await customerAccount(customerId)).moneyDueFils,1000);const receipt={customerId,receivableId:"order_"+deferred.orderId,requestId:randomUUID(),amount:500,method:"CASH",adminUid:"preview-admin"};await settleReceivable(receipt);await settleReceivable(receipt);assert.equal((await customerAccount(customerId)).moneyDueFils,500);assert.equal((await data("shifts",shift.id)).cashSalesFils,2000);});
await check("handover any time closes once; new employee starts immediately; admin delivers earlier order into new shift",async()=>{const earlier=await createDeliveryOrder(input("CASH",1,0),actor);await changeEmployeeOrderStatus(earlier.orderId,"READY",actor,false);await closeShift({...actor,shiftId:shift.id,actualCashFils:2000});await closeShift({...actor,shiftId:shift.id,actualCashFils:2000});const next=await startShift({...actor,employeeId:"next",shiftType:"MORNING"});await changeAdminDeliveryOrderStatus(earlier.orderId,"DELIVERED","preview-admin",{paymentCollected:true,reason:"",bottleReturns:[]});assert.equal((await data("shifts",next.id)).cashSalesFils,500);assert.equal((await data("shifts",shift.id)).cashSalesFils,2000);const overview=await getDashboardOverview("shift",new Date(),undefined,next.id);assert.equal(overview.selectedShiftId,next.id);assert.equal(overview.expectedCashFils,500);assert.ok(overview.buckets.every(b=>!b.label.includes("NaN")));});
await check("pure payment plan rejects invalid input and preserves special prices",async()=>{const p=deliveryPaymentPlan([{category:"REFILL",quantity:3,unitPriceFils:750},{category:"CUPS",quantity:1,unitPriceFils:1000}],2,true);assert.equal(p.moneyDueFils,1750);assert.equal(p.couponQuantity,2);assert.throws(()=>deliveryPaymentPlan([],NaN,true));});
await check("ordinary customer has no private step and cannot forge stock exemption",async()=>{const regularId=prefix+"-regular";await set("customers",regularId,{name:"عميل عادي",phoneNormalized:"+962790000008",isArchived:false});const ordinary=input("CASH",1,999);ordinary.customerId=regularId;ordinary.items[0].storeBottleShortageConfirmed=false;const result=await createDeliveryOrder(ordinary,{...actor,employeeId:"next"});assert.equal((await data("deliveryOrders",result.orderId)).items[0].personalBottleQuantity,0);await changeEmployeeOrderStatus(result.orderId,"CANCELLED",{...actor,employeeId:"next"},false);await db.collection("customers").doc(regularId).delete();});
await check("ownership-only profile saves and is reusable after deliveries",async()=>{const {savePrivateBottles}=load("@/lib/customers/private-bottles");const rows=await savePrivateBottles(customerId,[{origin:"JORDANIAN",sizeMl:20000,owned:3}],"preview-admin");assert.equal(rows[0].owned,3);assert.equal(rows[0].atStore,undefined);});
await checkSettlements({db,load,check,projectId:testApp.options.projectId,actor,customerId,bookId,input});
await checkRosters({db,load,check,employeeId,projectId:testApp.options.projectId});
await checkShiftOpening({db,load,check,projectId:testApp.options.projectId,actor,Timestamp});
console.log(`Operational emulator checks passed: ${checks}. Test project: demo-alfanar-checks; live data untouched.`);
// Remove only this run's invented fixtures from the emulator. Never scan or
// delete outside the guarded demo project, and never touch user preview data.
assert.equal(process.env.FIREBASE_ADMIN_PROJECT_ID,"demo-alfanar-preview");
assert.equal(process.env.FIRESTORE_EMULATOR_HOST,"127.0.0.1:8180");
assert.equal(testApp.options.projectId,"demo-alfanar-checks");
const testOrders=await db.collection("deliveryOrders").where("storeAuthUid","==",prefix).get();
const orderIds=new Set(testOrders.docs.map(d=>d.id));
for(const collection of await db.listCollections()){
  const snapshot=await collection.get();
  const targets=snapshot.docs.filter(doc=>{const v=doc.data();return doc.id.startsWith(prefix)||v.storeAuthUid===prefix||v.customerId===customerId||v.employeeId===employeeId||orderIds.has(v.orderId)||v.actor?.id===employeeId;});
  for(let i=0;i<targets.length;i+=400){const batch=db.batch();targets.slice(i,i+400).forEach(doc=>batch.delete(doc.ref));await batch.commit();}
}
console.log("Removed this run's synthetic fixtures only; personal preview fixtures preserved.");
await db.terminate();
