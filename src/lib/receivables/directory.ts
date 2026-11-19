import "server-only";
import { Timestamp } from "firebase-admin/firestore";
import { getFirebaseAdminFirestore } from "@/lib/firebase/admin";
import { unsigned } from "./records";
export async function receivablesDirectory() {
  const db=getFirebaseAdminFirestore(),limit=5000;
  const [debts,oldOrders]=await Promise.all([db.collection("customerReceivables").where("outstanding",">",0).limit(limit+1).get(),db.collection("deliveryOrders").where("pendingCouponQuantity",">",0).limit(limit+1).get()]);
  const records=new Map(debts.docs.slice(0,limit).map(d=>[d.id,d.data()]));
  const legacy=oldOrders.docs.slice(0,limit).filter(d=>d.data().status==="DELIVERED"&&d.data().paymentMethod==="COUPON"&&!records.has(`order_${d.id}`));
  for(let i=0;i<legacy.length;i+=150){
    const group=legacy.slice(i,i+150),existing=await db.getAll(...group.map(d=>db.collection("customerReceivables").doc(`order_${d.id}`)));
    existing.forEach((debt,index)=>{const doc=group[index],d=doc.data();if(debt.exists){if(unsigned(debt.data()!.outstanding)>0)records.set(debt.id,debt.data()!);}else records.set(`order_${doc.id}`,{customerId:d.customerId,customerName:d.customerNameSnapshot,kind:"COUPON",outstanding:unsigned(d.pendingCouponQuantity),createdAt:d.deliveredAt??d.createdAt});});
  }
  const rows=new Map<string,{customerId:string;name:string;phone:string;moneyDueFils:number;couponsDue:number;oldestAt:string|null;lastAt:string|null}>();
  for(const d of records.values()){
    if(typeof d.customerId!=="string"||!d.customerId||!["MONEY","COUPON"].includes(d.kind))throw Error("Invalid receivable");
    const value=unsigned(d.outstanding),row=rows.get(d.customerId)??{customerId:d.customerId,name:String(d.customerName??"عميل"),phone:"",moneyDueFils:0,couponsDue:0,oldestAt:null,lastAt:null},at=d.createdAt instanceof Timestamp?d.createdAt.toDate().toISOString():null;
    if(d.kind==="MONEY")row.moneyDueFils+=value;else row.couponsDue+=value;
    if(at&&(!row.oldestAt||at<row.oldestAt))row.oldestAt=at;if(at&&(!row.lastAt||at>row.lastAt))row.lastAt=at;rows.set(d.customerId,row);
  }
  const values=[...rows.values()];
  for(let i=0;i<values.length;i+=150){const group=values.slice(i,i+150),customers=await db.getAll(...group.map(row=>db.collection("customers").doc(row.customerId)));customers.forEach((doc,index)=>{group[index].name=String(doc.data()?.name??group[index].name);group[index].phone=String(doc.data()?.phoneNormalized??"");});}
  return {rows:values,totalFils:values.reduce((n,r)=>n+r.moneyDueFils,0),partial:debts.size>limit||oldOrders.size>limit};
}
