import { configurePreview } from "./env.mjs";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore,Timestamp } from "firebase-admin/firestore";
import { createHmac,randomBytes,scryptSync } from "node:crypto";
configurePreview();
const app=initializeApp({projectId:"demo-alfanar-preview"}),db=getFirestore(app),auth=getAuth(app),now=Timestamp.now();
for(const [uid,email,principalType] of [["preview-admin","admin@preview.test","ADMIN_ACCOUNT"],["preview-store","store@preview.test","STORE_ACCOUNT"]]){
  try{await auth.createUser({uid,email,password:"Preview123!"});}catch(e){if(e.code!=="auth/uid-already-exists"&&e.code!=="auth/email-already-exists")throw e;}
  await auth.setCustomUserClaims(uid,{principalType});
}
const salt=randomBytes(16),key=scryptSync(createHmac("sha256",process.env.EMPLOYEE_PIN_PEPPER).update("1234").digest(),salt,32,{N:131072,r:8,p:1,maxmem:256*1024*1024});
for(const [id,name] of [["preview-morning","موظف تجربة صباحي"],["preview-evening","موظف تجربة مسائي"]]){
 if(!(await db.collection("employees").doc(id).get()).exists)await db.collection("employees").doc(id).set({name,isActive:true,pinHash:["scrypt","v1",131072,8,1,salt.toString("hex"),key.toString("hex")].join("$"),authVersion:0,createdAt:now,updatedAt:now});
}
const records={
 "systemSettings/employeeWage":{dailyWageFils:0},"systemSettings/employeeShiftTimes":{morningStart:"08:00",morningEnd:"16:00",eveningStart:"16:00",eveningEnd:"00:00"},
 "inventorySettings/main":{active:true},
 "inventorySettings/refillRecipe":{rows:[{itemId:"preview-cap",quantity:1}]},
 "customers/preview-customer":{name:"عميل تجربة كوبونات وقوارير خاصة",phoneNormalized:"+962790000001",primaryAddress:"عنوان تجريبي — لا يوجد توصيل فعلي",adminNotes:"بيانات وهمية",couponBalance:0,appAuthUid:null,isArchived:false,createdSource:"ADMIN",createdByAuthUid:"preview-admin",updatedByAuthUid:"preview-admin",createdAt:now,updatedAt:now},
 "couponBooklets/preview-book":{customerId:"preview-customer",customerNameSnapshot:"عميل تجربة",serial:"990001",bookletNumber:"990001",status:"ACTIVE",remainingCoupons:2,reservedCoupons:0,totalCoupons:22,createdAt:now,activatedAt:now},
 "customerPrivateBottles/preview-customer":{rows:[{origin:"JORDANIAN",sizeMl:20000,owned:4,reserved:0}]},
};
for(const [id,category,name,price] of [["preview-refill","REFILL","تعبئة قارورة 20 لتر",500],["preview-cups","CUPS","كرتونة أكواب تجربة",1000]]){
 records[`products/${id}`]={name,category,storePriceFils:price,deliveryPriceFils:price,isActive:true,isDeleted:false,showForEmployee:true,showForCustomerApp:false,requiresBottleOrigin:category==="REFILL",bottleSizeMl:category==="REFILL"?20000:0,deliveryEnabled:true,imageUrl:null,createdAt:now,updatedAt:now};
 records[`inventoryPolicies/${id}`]=category==="REFILL"?{productId:id,mode:"REFILL",autoBottlePools:true,bottleSizeMl:20000,pools:[],consumables:[],deliveryEnabled:true}:{productId:id,mode:"STOCK",itemId:"preview-goods",unitsPerSale:1,location:"ROOM",pools:[],consumables:[],deliveryEnabled:true};
}
for(const [id,kind,name,origin] of [["preview-cap","CONSUMABLE","أغطية تجربة","DEFAULT"],["preview-goods","GOODS","أكواب تجربة","DEFAULT"],["preview-jordan","BOTTLE_POOL","قوارير المحل أردني 20 لتر","JORDANIAN"],["preview-saudi","BOTTLE_POOL","قوارير المحل سعودي 20 لتر","SAUDI"]])records[`inventoryItems/${id}`]={code:id,name,kind,brand:"تجربة",size:"20 لتر",bottleSizeMl:20000,baseUnit:"وحدة",packLabel:"وحدة",unitsPerPack:1,origin,room:100,cooler:0,reservedRoom:0,reservedCooler:0,out:0,owed:0,review:0,lowStock:5,active:true,identityKey:id,createdAt:now,updatedAt:now};
let count=0;for(const [path,value] of Object.entries(records)){const ref=db.doc(path);if(!(await ref.get()).exists){await ref.set(value);count++;}}
console.log(`Preview fixtures ready (${count} new documents); production was not accessed.`);await app.delete();
