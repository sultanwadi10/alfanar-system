import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

export async function checkSettlements({db,load,check,projectId,actor,customerId,bookId,input}){
  assert.equal(projectId,"demo-alfanar-checks");assert.equal(process.env.FIRESTORE_EMULATOR_HOST,"127.0.0.1:8180");
  const {settleReceivablesBatch}=load("@/lib/receivables/settle-batch"),{getActiveShift,closeShift}=load("@/lib/shifts/shift-repository");
  const {createDeliveryOrder}=load("@/lib/orders/delivery-order-repository"),{changeEmployeeOrderStatus}=load("@/lib/orders/delivery-order-operations"),{getDashboardOverview}=load("@/lib/admin/dashboard-overview");
  const {receivablesDirectory}=load("@/lib/receivables/directory"),{getAdminCouponDashboard}=load("@/lib/coupons/booklet-service");
  const read=async(c,id)=>(await db.collection(c).doc(id).get()).data();
  const nextActor={...actor,employeeId:"next"},active=await getActiveShift(actor.storeAuthUid);
  async function debt(){const result=await createDeliveryOrder(input("CASH",1,1),nextActor);await changeEmployeeOrderStatus(result.orderId,"READY",nextActor,false);await changeEmployeeOrderStatus(result.orderId,"DELIVERED",nextActor,false,[],[],true);return {receivableId:`order_${result.orderId}`,expectedOutstanding:500};}
  const first=await debt(),second=await debt(),items=[first,second];const start=(await read("shifts",active.id)).cashSalesFils;
  const request={requestId:randomUUID(),customerId,amount:750,method:"CASH",items,adminUid:"test-admin"};
  await check("batch rejects one stale order before writing any debt or cash",async()=>{
    await assert.rejects(settleReceivablesBatch({...request,items:[first,{...second,expectedOutstanding:501}]}),e=>e.code==="BALANCE_CHANGED");
    assert.equal((await read("customerReceivables",first.receivableId)).outstanding,500);assert.equal((await read("shifts",active.id)).cashSalesFils,start);
    await assert.rejects(settleReceivablesBatch({...request,items:[first,first]}),e=>e.code==="INVALID_INPUT");
  });
  await check("multi-order partial settlement is atomic, exact and idempotent",async()=>{
    await settleReceivablesBatch(request);await settleReceivablesBatch(request);
    assert.equal((await read("customerReceivables",first.receivableId)).outstanding,0);assert.equal((await read("customerReceivables",second.receivableId)).outstanding,250);
    assert.equal((await read("shifts",active.id)).cashSalesFils,start+750);
    const receipts=await db.collection("receivableCollections").where("batchId","==",request.requestId).get();assert.equal(receipts.size,2);assert.equal(receipts.docs.reduce((s,d)=>s+d.data().amount,0),750);
    await assert.rejects(settleReceivablesBatch({...request,amount:500}),e=>e.code==="REQUEST_CONFLICT");
  });
  await check("CLICK settlement finishes the chosen debt without changing cash",async()=>{
    await settleReceivablesBatch({...request,requestId:randomUUID(),items:[{...second,expectedOutstanding:250}],amount:250,method:"CLICK"});
    assert.equal((await read("shifts",active.id)).cashSalesFils,start+750);assert.equal((await read("shifts",active.id)).clickSalesFils,250);
  });
  await check("concurrent collections cannot overpay a customer",async()=>{
    const third=await debt(),body={...request,items:[third],amount:250};
    const results=await Promise.allSettled([settleReceivablesBatch({...body,requestId:randomUUID()}),settleReceivablesBatch({...body,requestId:randomUUID()})]);
    assert.equal(results.filter(r=>r.status==="fulfilled").length,1);assert.equal(results.find(r=>r.status==="rejected").reason.code,"BALANCE_CHANGED");assert.equal((await read("customerReceivables",third.receivableId)).outstanding,250);
  });
  await check("coupon ledger resolves current customer names for active and exhausted books",async()=>{
    const at=(await read("couponBooklets",bookId)).createdAt;
    await db.collection("couponBooklets").doc(bookId).update({serial:"96",status:"ACTIVE"});
    await db.collection("couponBooklets").doc(bookId+"-empty").set({customerId,status:"ACTIVE",serial:"95",remainingCoupons:0,reservedCoupons:0,createdAt:at});
    const dashboard=await getAdminCouponDashboard();
    assert.equal(dashboard.booklets.find(b=>b.id===bookId).customerName,"عميل اختبار آلي");
    const exhausted=dashboard.booklets.find(b=>b.id===bookId+"-empty");assert.equal(exhausted.status,"EXHAUSTED");assert.equal(exhausted.customerName,"عميل اختبار آلي");
  });
  await check("receivables directory includes old pending coupons without duplicating recorded debt",async()=>{
    const {Timestamp}=await import("firebase-admin/firestore");
    const legacyId="20261119-88888888";await db.collection("deliveryOrders").doc(legacyId).set({customerId,storeAuthUid:actor.storeAuthUid,customerNameSnapshot:"عميل اختبار آلي",status:"DELIVERED",paymentMethod:"COUPON",pendingCouponQuantity:2,createdAt:Timestamp.now()});
    const before=await receivablesDirectory(),row=before.rows.find(r=>r.customerId===customerId);assert.equal(row.couponsDue,2);
    await db.collection("customerReceivables").doc("order_"+legacyId).set({customerId,storeAuthUid:actor.storeAuthUid,kind:"COUPON",outstanding:2,createdAt:Timestamp.now()});
    assert.equal((await receivablesDirectory()).rows.find(r=>r.customerId===customerId).couponsDue,2);
  });
  await check("cash split closes once, rejects mismatched totals and appears on the admin shift",async()=>{
    const total=(await read("shifts",active.id)).cashSalesFils;
    await assert.rejects(closeShift({...nextActor,shiftId:active.id,actualCashFils:total,banknotesFils:total,coinsFils:1}));
    assert.equal((await read("shifts",active.id)).status,"OPEN");
    const request={...nextActor,shiftId:active.id,actualCashFils:total,banknotesFils:1000,coinsFils:total-1000};
    assert.ok(await closeShift(request));assert.ok(await closeShift(request));await assert.rejects(closeShift({...request,actualCashFils:total+1}));assert.equal(await closeShift({...request,actualCashFils:total+1,coinsFils:request.coinsFils+1}),null);
    const overview=await getDashboardOverview("shift",new Date(),undefined,active.id);assert.equal(overview.cashCount.banknotesFils,1000);assert.equal(overview.cashCount.coinsFils,total-1000);assert.equal(overview.cashCount.actualCashFils,total);assert.equal(overview.cashCount.closed,true);assert.equal(overview.shifts.find(s=>s.id===active.id).shiftType,"MORNING");
  });
  await check("shift totals exclude another shift's operations even when their timestamps overlap",async()=>{
    const {Timestamp}=await import("firebase-admin/firestore");const openedAt=(await read("shifts",active.id)).openedAt;
    await db.collection("directSales").doc(actor.storeAuthUid+"-foreign").set({createdAt:Timestamp.fromMillis(openedAt.toMillis()+1),shiftId:"unrelated",storeAuthUid:actor.storeAuthUid,paymentMethod:"CASH",totalFils:999999,items:[]});
    await db.collection("directSales").doc(actor.storeAuthUid+"-foreign-legacy").set({createdAt:Timestamp.fromMillis(openedAt.toMillis()+1),storeAuthUid:"unrelated",paymentMethod:"CASH",totalFils:999999,items:[]});
    const overview=await getDashboardOverview("shift",new Date(),undefined,active.id);assert.equal(overview.storeSales,0);assert.equal(overview.storeCash,0);
  });
}
