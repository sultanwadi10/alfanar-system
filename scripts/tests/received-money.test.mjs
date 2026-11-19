import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
function load(name){const exports={};vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../../src/lib/orders/"+name+".ts",import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:()=>load("payment-plan")});return exports;}
const {receivedOrderMoney,receivedLineValues}=load("received-money");
test("only delivered collected money is income; coupons, unpaid and receipt-backed orders contribute zero",()=>{
 const order={status:"DELIVERED",paymentState:"COLLECTED",paymentMethod:"CASH",totalFils:1500,moneyDueFils:500,collectedFils:500};
 assert.equal(receivedOrderMoney(order),500);
 for(const status of ["NEW","READY","CANCELLED"])assert.equal(receivedOrderMoney({...order,status}),0);
 for(const paymentState of ["PAYMENT_DUE","PARTIALLY_COLLECTED","AWAITING_COLLECTION"])assert.equal(receivedOrderMoney({...order,paymentState}),0);
 assert.equal(receivedOrderMoney({...order,collectionMode:"RECEIPTS"}),0);
 assert.equal(receivedOrderMoney({status:"DELIVERED",paymentState:"COLLECTED",paymentMethod:"COUPON",totalFils:1500}),0);
 assert.throws(()=>receivedOrderMoney({...order,collectedFils:501}));
});
test("monetary product totals exclude coupon quantities and preserve exact fils",()=>{
 const items=[{lineTotalFils:1500,unitPriceFils:500,moneyQuantity:1},{lineTotalFils:1000,unitPriceFils:1000,moneyQuantity:1}];
 assert.deepEqual([...receivedLineValues(items,1500)],[500,1000]);
 assert.deepEqual([...receivedLineValues(items,0)],[0,0]);
 const partial=[...receivedLineValues([{lineTotalFils:333},{lineTotalFils:667}],501)];assert.equal(partial.reduce((s,n)=>s+n,0),501);assert.ok(partial.every(Number.isInteger));
 assert.throws(()=>receivedLineValues(items,1501));assert.throws(()=>receivedLineValues(items,NaN));
});
