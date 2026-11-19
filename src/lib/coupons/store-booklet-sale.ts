import "server-only";
import { createHash } from "node:crypto";
import { activeCollectionShift } from "@/lib/receivables/active-collection-shift";
import { FieldValue,Timestamp } from "firebase-admin/firestore";
import { getFirebaseAdminFirestore } from "@/lib/firebase/admin";
import { DEFAULT_SHIFT_TIMES, shiftTimeSnapshot } from "@/lib/shifts/shift-payroll";
import { BookletError } from "./booklet-error";
export async function storeBookletOptions() {
 const db=getFirebaseAdminFirestore();
 const [stock,price,times]=await Promise.all([db.collection("couponBooklets").where("status","==","IN_STOCK").limit(5001).get(),db.collection("couponBookletSettings").doc("standard").get(),db.collection("systemSettings").doc("employeeShiftTimes").get()]);
 if(stock.size>5000) throw new BookletError("STOCK_LIMIT","عدد الدفاتر المتاحة كبير؛ راجع الإدارة.");
 return {booklets:stock.docs.map(d=>({id:d.id,serial:String(d.data().serial),status:"IN_STOCK"})),priceFils:price.data()?.priceFils??null,suggestion:shiftTimeSnapshot(new Date(),times.data() as typeof DEFAULT_SHIFT_TIMES??DEFAULT_SHIFT_TIMES)};
}
export type StoreBookletInput={requestId:string;customerId:string;bookletId:string;paymentMethod:"CASH"|"CLICK";expectedPriceFils:number;financialDate:string;period:"MORNING"|"EVENING";adminUid:string};
export async function sellStoreBooklet(input:StoreBookletInput) {
 const db=getFirebaseAdminFirestore(), today=shiftTimeSnapshot(new Date(),DEFAULT_SHIFT_TIMES).workDay;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(input.financialDate)||!Number.isFinite(Date.parse(input.financialDate))||new Date(input.financialDate+"T12:00:00Z").toISOString().slice(0,10)!==input.financialDate||input.financialDate>today) throw new BookletError("INVALID_DATE","اختر تاريخ بيع صحيحًا لا يتجاوز اليوم.");
 const id="store_"+input.requestId, saleRef=db.collection("couponBookletSales").doc(id),bookletRef=db.collection("couponBooklets").doc(input.bookletId),customerRef=db.collection("customers").doc(input.customerId);
 const fingerprint=createHash("sha256").update(JSON.stringify([input.customerId,input.bookletId,input.paymentMethod,input.expectedPriceFils,input.financialDate,input.period])).digest("hex");
 return db.runTransaction(async tx=>{
 const [existing,bookletDoc,customerDoc,priceDoc,timeDoc]=await Promise.all([tx.get(saleRef),tx.get(bookletRef),tx.get(customerRef),tx.get(db.collection("couponBookletSettings").doc("standard")),tx.get(db.collection("systemSettings").doc("employeeShiftTimes"))]);
 if(existing.exists){if(existing.data()?.fingerprint!==fingerprint)throw new BookletError("REQUEST_CONFLICT","طلب التسجيل مستخدم لبيانات مختلفة. أعد فتح نافذة البيع.");return {unchanged:true,saleId:id};}
 const b=bookletDoc.data(),c=customerDoc.data(),price=priceDoc.data()?.priceFils;
 if(!c||c.isArchived)throw new BookletError("CUSTOMER_UNAVAILABLE","العميل غير متاح.");
 if(c.pendingBookletSaleOrderId)throw new BookletError("PENDING_SALE","اعتمد دفتر التوصيل المعلّق لهذا العميل أولًا.");
 if(!b||b.status!=="IN_STOCK"||b.customerId!==null||b.remainingCoupons!==0||b.reservedCoupons!==0)throw new BookletError("BOOKLET_UNAVAILABLE","الدفتر غير متاح للبيع.");
 if(!Number.isSafeInteger(price)||price<=0||price!==input.expectedPriceFils)throw new BookletError("PRICE_CHANGED","سعر الدفتر غير محدد أو تغيّر. أعد فتح نافذة البيع.");
 const candidate=await activeCollectionShift(tx,db);
 const active=candidate?.data.shiftTimeSnapshot?.workDay===input.financialDate&&candidate.data.shiftTimeSnapshot.shiftType===input.period?candidate:null;
 const times=timeDoc.data() as typeof DEFAULT_SHIFT_TIMES??DEFAULT_SHIFT_TIMES,key=input.period==="MORNING"?"morning":"evening",start=times[(key+"Start") as keyof typeof times];
 if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(start))throw new BookletError("INVALID_TIMES","راجع أوقات الشفتات عند الإدارة.");
 const now=Timestamp.now(),financialAt=active?now:Timestamp.fromDate(new Date(input.financialDate+"T"+start+":00+03:00"));
 if(financialAt.toMillis()>now.toMillis())throw new BookletError("FUTURE_PERIOD","الفترة المختارة لم تبدأ بعد. اختر فترة البيع الفعلية.");
 tx.create(saleRef,{channel:"STORE",shiftId:active?.ref.id??null,storeAuthUid:active?.data.storeAuthUid??null,bookletId:input.bookletId,serial:b.serial,customerId:input.customerId,priceFils:price,paymentMethod:input.paymentMethod,financialDate:input.financialDate,financialPeriod:input.period,financialAt,shiftTimesSnapshot:times,createdAt:now,recordedByAdminUid:input.adminUid,fingerprint});
 if(active)tx.update(active.ref,{totalSalesFils:FieldValue.increment(price),cashSalesFils:FieldValue.increment(input.paymentMethod==="CASH"?price:0),clickSalesFils:FieldValue.increment(input.paymentMethod==="CLICK"?price:0),updatedAt:now});
 tx.update(bookletRef,{status:"ACTIVE",customerId:input.customerId,orderId:null,remainingCoupons:22,reservedCoupons:0,issuedCoupons:22,activatedAt:now,updatedAt:now,saleId:id});
 tx.update(customerRef,{updatedAt:now});
 tx.create(db.collection("couponBookletTransactions").doc("ISSUE_STORE_"+input.bookletId),{type:"BOOKLET_ISSUED",source:"STORE_SALE",bookletId:input.bookletId,customerId:input.customerId,quantity:22,saleId:id,createdAt:now,adminUid:input.adminUid,reason:"بيع دفتر في المحل"});
 return {unchanged:false,saleId:id};
 });
}
