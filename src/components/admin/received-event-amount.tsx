import type { ReactNode } from "react";
import type { DashboardEvent } from "@/types/admin-overview";
export function ReceivedEventAmount({event,renderMoney}:{event:DashboardEvent;renderMoney:(amount:number)=>ReactNode}){
  if(event.payment==="COUPON"&&event.amount===0)return <strong>{event.coupons?`${event.coupons} كوبون`:event.pendingCoupons?`${event.pendingCoupons} كوبون مستحق`:"كوبونات"}</strong>;
  return <span>{renderMoney(event.amount)}{(event.coupons??0)>0&&<small> + {event.coupons} كوبون</small>}</span>;
}
