import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

export async function checkReceivedMoney({db,load,check,projectId,actor,customerId,bookId,input}){
  assert.equal(projectId,"demo-alfanar-checks");assert.equal(process.env.FIRESTORE_EMULATOR_HOST,"127.0.0.1:8180");
  const read=async(c,id)=>(await db.collection(c).doc(id).get()).data();
  const {getActiveShift}=load("@/lib/shifts/shift-repository"),{getDashboardOverview}=load("@/lib/admin/dashboard-overview");
  const {createDeliveryOrder}=load("@/lib/orders/delivery-order-repository"),{changeEmployeeOrderStatus}=load("@/lib/orders/delivery-order-operations"),{changeAdminDeliveryOrderStatus}=load("@/lib/orders/admin-delivery-orders");
  const {createManualDebt}=load("@/lib/receivables/manual-debt"),{settleReceivablesBatch}=load("@/lib/receivables/settle-batch"),{customerAccount}=load("@/lib/receivables/service"),{receivablesDirectory}=load("@/lib/receivables/directory");
  const next={...actor,employeeId:"next"},active=await getActiveShift(actor.storeAuthUid);
  const overview=()=>getDashboardOverview("shift",new Date(),undefined,active.id);
  const original=await overview();
  await check("mixed coupon and cash order recognizes only the paid remainder including correction receipts",async()=>{
    const history=await db.collection("shifts").where("storeAuthUid","==",actor.storeAuthUid).get();
    const closed=history.docs.find(d=>d.data().status==="CLOSED");
    const view=await getDashboardOverview("shift",new Date(),undefined,closed.id);
    assert.equal(view.deliverySales,closed.data().cashSalesFils+closed.data().clickSalesFils);
    assert.equal(view.events.reduce((n,e)=>n+e.amount,0),view.deliverySales+view.storeSales);
  });
  let couponOrder,debtOrder,manual;
  await check("coupon redemption increases delivered quantity but never received sales or cash",async()=>{
    const before=await read("shifts",active.id),result=await createDeliveryOrder(input("COUPON",1,1),next);couponOrder=result.orderId;
    await changeEmployeeOrderStatus(couponOrder,"READY",next,false);await changeEmployeeOrderStatus(couponOrder,"DELIVERED",next,false,[]);
    const after=await read("shifts",active.id),view=await overview();
    assert.equal(after.totalSalesFils,before.totalSalesFils);assert.equal(after.cashSalesFils,before.cashSalesFils);
    assert.equal(view.deliverySales,original.deliverySales);assert.equal(view.couponSales,0);assert.equal(view.couponCount,original.couponCount+1);
    assert.equal(view.events.find(e=>e.id===`delivery:${couponOrder}`).amount,0);
  });
  await check("new, ready and unpaid delivered orders never add cash; admin delivery opens the exact debt",async()=>{
    const before=await read("shifts",active.id);const result=await createDeliveryOrder(input("CASH",2,2),next);debtOrder=result.orderId;
    assert.equal((await read("shifts",active.id)).cashSalesFils,before.cashSalesFils);
    await changeEmployeeOrderStatus(debtOrder,"READY",next,false);assert.equal((await overview()).deliverySales,original.deliverySales);
    await changeAdminDeliveryOrderStatus(debtOrder,"DELIVERED","test-admin",{paymentCollected:false,paymentDeferred:true,reason:"",bottleReturns:[]});
    const after=await read("shifts",active.id);assert.equal(after.cashSalesFils,before.cashSalesFils);assert.equal(after.totalSalesFils,before.totalSalesFils);
    assert.equal((await read("customerReceivables","order_"+debtOrder)).outstanding,1000);
    assert.equal((await overview()).deliverySales,original.deliverySales);
  });
  await check("previous debt creation is idempotent, changes no orders, stock or shift, and appears in customer accounts",async()=>{
    const stock=await db.collection("inventoryItems").get(),before=await read("shifts",active.id),orders=await db.collection("deliveryOrders").get();
    const body={customerId,requestId:randomUUID(),amount:2500,adminUid:"test-admin"};manual=await createManualDebt(body);await createManualDebt(body);
    await assert.rejects(createManualDebt({...body,amount:2600}),e=>e.code==="REQUEST_CONFLICT");
    await assert.rejects(createManualDebt({...body,requestId:randomUUID(),customerId:"missing"}),e=>e.code==="NOT_FOUND");
    await assert.rejects(createManualDebt({...body,requestId:randomUUID(),amount:0}),e=>e.code==="INVALID_INPUT");
    assert.equal((await db.collection("deliveryOrders").get()).size,orders.size);
    assert.deepEqual((await db.collection("inventoryItems").get()).docs.map(d=>d.data()),stock.docs.map(d=>d.data()));
    assert.deepEqual(await read("shifts",active.id),before);
    assert.ok((await customerAccount(customerId)).outstanding.some(d=>d.id===manual.id));
    assert.ok((await receivablesDirectory()).rows.find(r=>r.customerId===customerId).moneyDueFils>=3500);
  });
  await check("mixed previous and order debts settle partially once into received cash without new physical sales",async()=>{
    const before=await overview(),shift=await read("shifts",active.id),body={requestId:randomUUID(),customerId,amount:1500,method:"CASH",adminUid:"test-admin",items:[{receivableId:"order_"+debtOrder,expectedOutstanding:1000},{receivableId:manual.id,expectedOutstanding:2500}]};
    await settleReceivablesBatch(body);await settleReceivablesBatch(body);
    assert.equal((await read("customerReceivables","order_"+debtOrder)).outstanding,0);assert.equal((await read("customerReceivables",manual.id)).outstanding,2000);
    assert.equal((await read("shifts",active.id)).cashSalesFils,shift.cashSalesFils+1500);
    assert.equal((await read("shifts",active.id)).totalSalesFils,shift.totalSalesFils+1500);
    const view=await overview();assert.equal(view.storeCash,before.storeCash+500);assert.equal(view.deliveryCash,before.deliveryCash+1000);assert.equal(view.storeCount,before.storeCount);assert.equal(view.deliveryCount,before.deliveryCount);
    await assert.rejects(settleReceivablesBatch({...body,requestId:randomUUID()}),e=>e.code==="BALANCE_CHANGED");
    await settleReceivablesBatch({...body,requestId:randomUUID(),amount:2000,method:"CLICK",items:[{receivableId:manual.id,expectedOutstanding:2000}]});
    const paid=await overview();assert.equal(paid.storeClick,view.storeClick+2000);assert.equal(paid.storeCash,view.storeCash);
  });
  await check("store booklet payment counts once in shift sales, cash and handover report",async()=>{
    const before=await overview(),shift=await read("shifts",active.id),book=bookId+"-sale";
    await db.collection("couponBooklets").doc(book).set({customerId:null,status:"IN_STOCK",serial:"TEST-BOOK",remainingCoupons:0,reservedCoupons:0});
    await db.collection("couponBookletSettings").doc("standard").set({priceFils:10000});
    const {sellStoreBooklet}=load("@/lib/coupons/store-booklet-sale"),{bookletCashPeriods}=load("@/lib/coupons/booklet-cash-periods");
    const body={requestId:randomUUID(),customerId,bookletId:book,paymentMethod:"CASH",expectedPriceFils:10000,financialDate:shift.shiftTimeSnapshot.workDay,period:shift.shiftTimeSnapshot.shiftType,adminUid:"test-admin"};
    await sellStoreBooklet(body);await sellStoreBooklet(body);
    const view=await overview();assert.equal(view.storeSales,before.storeSales+10000);assert.equal(view.storeCash,before.storeCash+10000);assert.equal(view.bookletCount,before.bookletCount+1);
    const after=await read("shifts",active.id);assert.equal(after.cashSalesFils,shift.cashSalesFils+10000);assert.equal(after.totalSalesFils,shift.totalSalesFils+10000);
    const periods=await bookletCashPeriods(new Date(body.financialDate+"T00:00:00+03:00"),new Date(new Date(body.financialDate+"T00:00:00+03:00").getTime()+86400000),new Date());
    const row=periods.rows.find(r=>r.day===body.financialDate&&r.period===body.period);assert.equal(row.bookletCashInShift,10000);assert.equal(row.expected,row.shiftCash-row.wage);
    assert.equal(view.events.reduce((s,e)=>s+e.amount,0),view.storeSales+view.deliverySales);
    assert.equal(view.buckets.reduce((s,b)=>s+b.store+b.delivery,0),view.storeSales+view.deliverySales);
  });
}
