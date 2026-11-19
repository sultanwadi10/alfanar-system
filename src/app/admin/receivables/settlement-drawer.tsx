"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { AlfanarIcon } from "@/components/admin/alfanar-icon";
import { newRequestId } from "@/lib/client/request-id";
import { userMessage } from "@/lib/client/user-message";
import { parseDinars, dinars } from "@/lib/format/money-input";
import { SETTLEMENT_LIMIT } from "@/lib/receivables/settlement-plan";
import styles from "./receivables.module.css";

type Debt={id:string;source?:"ORDER"|"MANUAL";orderId:string|null;orderNumber:string|null;kind:"MONEY"|"COUPON";outstanding:number;at:string|null};
type Account={moneyDueFils:number;couponsDue:number;availableCoupons:number;partial:boolean;outstanding:Debt[];receipts:{id:string;source?:"ORDER"|"MANUAL";orderNumber:string;amount:number;method:string;at:string|null}[]};
export type ReceivableCustomer={customerId:string;name:string;phone:string;moneyDueFils:number;couponsDue:number;oldestAt:string|null};
const money=(n:number)=>`${dinars(n)} د.أ`;
const date=(at:string|null)=>at?new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Amman",dateStyle:"short"}).format(new Date(at)):"—";

export function SettlementDrawer({customer,onClose,onChanged,onBusyChange}:{customer:ReceivableCustomer;onClose:()=>void;onChanged:()=>void;onBusyChange:(value:boolean)=>void}){
  const [account,setAccount]=useState<Account|null>(null),[selected,setSelected]=useState<string[]>([]),[kind,setKind]=useState<"MONEY"|"COUPON">("MONEY");
  const [amount,setAmount]=useState(""),[method,setMethod]=useState<"CASH"|"CLICK">("CASH"),[history,setHistory]=useState(false);
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
  const working=useRef(false),request=useRef<{key:string;id:string}|null>(null),generation=useRef(0),panel=useRef<HTMLElement>(null),title=useId();
  const endpoint=`/api/admin/customers/${encodeURIComponent(customer.customerId)}/receivables`;
  function choose(next:Account,nextKind:"MONEY"|"COUPON"){
    const rows=next.outstanding.filter(d=>d.kind===nextKind).slice(0,nextKind==="MONEY"?SETTLEMENT_LIMIT:1);
    setSelected(rows.map(r=>r.id));setAmount(nextKind==="MONEY"?(rows.reduce((s,r)=>s+r.outstanding,0)/1000).toFixed(3):String(rows[0]?.outstanding??0));setKind(nextKind);
  }
  const load=useCallback(async()=>{
    const token=++generation.current;setLoading(true);
    try{const response=await fetch(endpoint,{cache:"no-store"}),result=await response.json();if(!response.ok||!result.success)throw Error(result.error?.message??"تعذر تحميل المستحقات.");if(token===generation.current){const next:Account=result.data;setAccount(next);choose(next,next.moneyDueFils>0?"MONEY":"COUPON");setError("");}}
    catch(e){if(token===generation.current)setError(userMessage(e instanceof Error?e.message:"تعذر التحميل."));}finally{if(token===generation.current)setLoading(false);}
  },[endpoint]);
  useEffect(()=>{const token=generation;const timer=setTimeout(()=>void load(),0);panel.current?.focus();return()=>{clearTimeout(timer);++token.current;};},[load]);
  const debts=account?.outstanding.filter(d=>d.kind===kind)??[],chosen=debts.filter(d=>selected.includes(d.id)),selectedTotal=chosen.reduce((s,d)=>s+d.outstanding,0);
  const numeric=kind==="MONEY"?parseDinars(amount):/^\d+$/.test(amount)?Number(amount):null;
  const valid=numeric!==null&&Number.isSafeInteger(numeric)&&numeric>0&&numeric<=selectedTotal&&numeric<=100_000_000&&(kind!=="COUPON"||numeric<=(account?.availableCoupons??0));
  async function settle(event:React.FormEvent){
    event.preventDefault();if(!account||!valid||numeric===null||working.current||loading||account.partial)return;
    const payload=kind==="MONEY"?{amount:numeric,method,items:chosen.map(d=>({receivableId:d.id,expectedOutstanding:d.outstanding}))}:{amount:numeric,method:"COUPON",receivableId:chosen[0].id};
    const key=JSON.stringify(payload);if(request.current?.key!==key)request.current={key,id:newRequestId()};working.current=true;setBusy(true);onBusyChange(true);setError("");setMessage("");
    try{const response=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...payload,requestId:request.current.id})}),result=await response.json();if(!response.ok||!result.success)throw Error(result.error?.message??"تعذر تسجيل التسديد.");request.current=null;await load();onChanged();setMessage("تم تسجيل التسديد");}
    catch(e){setError(userMessage(e instanceof Error?e.message:"تعذر التسجيل."));}finally{working.current=false;setBusy(false);onBusyChange(false);}
  }
  return <aside ref={panel} tabIndex={-1} className={styles.drawer} aria-labelledby={title} aria-busy={busy||loading}>
    <header><h2 id={title}>{customer.name}</h2><button type="button" aria-label="إغلاق التسديد" disabled={busy} onClick={onClose}><AlfanarIcon name="x"/></button></header>
    {error&&<p className={styles.error} role="alert">{error}</p>}{message&&<p role="status" className={styles.message}>{message}</p>}
    {loading&&!account?<p role="status">جارٍ التحميل…</p>:account&&<>
      <div className={styles.balance}><span>المبلغ المستحق</span><strong dir="ltr">{money(account.moneyDueFils)}</strong></div>
      {account.partial&&<p role="alert" className={styles.error}>السجل غير مكتمل؛ التسديد غير متاح لهذه القراءة.</p>}
      {account.moneyDueFils>0&&account.couponsDue>0&&<div className={styles.segment}><button type="button" disabled={busy||loading} aria-pressed={kind==="MONEY"} onClick={()=>choose(account,"MONEY")}>مبالغ مالية</button><button type="button" disabled={busy||loading} aria-pressed={kind==="COUPON"} onClick={()=>choose(account,"COUPON")}>كوبونات</button></div>}
      <form onSubmit={settle}>
        <div className={styles.debts}><div className={styles.debtHead}><span>المستحق</span><span>{kind==="MONEY"?"المبلغ":"الكوبونات"}</span></div>{debts.map(debt=><label key={debt.id} className={styles.debt}><input type="checkbox" checked={selected.includes(debt.id)} disabled={busy||loading||kind==="MONEY"&&!selected.includes(debt.id)&&selected.length>=SETTLEMENT_LIMIT} onChange={e=>{const ids=kind==="COUPON"?(e.target.checked?[debt.id]:[]):e.target.checked?[...selected,debt.id]:selected.filter(id=>id!==debt.id);setSelected(ids);const total=debts.filter(d=>ids.includes(d.id)).reduce((s,d)=>s+d.outstanding,0);setAmount(kind==="MONEY"?(total/1000).toFixed(3):String(total));setMessage("");}}/><span>{debt.source==="MANUAL"?"مستحق سابق":`#${debt.orderNumber}`}</span><strong dir="ltr">{kind==="MONEY"?money(debt.outstanding):debt.outstanding}</strong></label>)}</div>
        {!debts.length&&<p className={styles.empty}>لا توجد مستحقات متبقية</p>}
        {debts.length>0&&<><label className={styles.amount}>مبلغ التسديد {kind==="COUPON"?"بالكوبونات":""}<input inputMode={kind==="MONEY"?"decimal":"numeric"} value={amount} onChange={e=>{setAmount(e.target.value);setMessage("");}} disabled={busy||loading} dir="ltr" aria-invalid={amount!==""&&!valid}/></label>
          {kind==="MONEY"?<div className={styles.methods}><button type="button" disabled={busy||loading} aria-pressed={method==="CASH"} onClick={()=>setMethod("CASH")}><AlfanarIcon name="coins"/>كاش</button><button type="button" disabled={busy||loading} aria-pressed={method==="CLICK"} onClick={()=>setMethod("CLICK")}><AlfanarIcon name="card"/>كليك</button></div>:<div className={styles.remainder}><span>الكوبونات المتاحة</span><b>{account.availableCoupons}</b></div>}
          <div className={styles.remainder}><span>المتبقي بعد التسديد</span><strong dir="ltr">{kind==="MONEY"?money(Math.max(0,account.moneyDueFils-(valid?numeric!:0))):`${Math.max(0,account.couponsDue-(valid?numeric!:0))} كوبون`}</strong></div>
          <button type="submit" className={styles.primary} disabled={busy||loading||!valid||account.partial}>{busy?"جارٍ التسجيل…":"تأكيد التسديد"}</button></>}
      </form>
      <button type="button" className={styles.historyButton} aria-expanded={history} onClick={()=>setHistory(!history)}>سجل التحصيلات<AlfanarIcon name={history?"chevron-up":"chevron-down"}/></button>
      {history&&<div className={styles.history}>{account.receipts.length?account.receipts.map(r=><article key={r.id}><div><strong>{r.source==="MANUAL"?"مستحق سابق":`#${r.orderNumber}`}</strong><small>{date(r.at)} · {r.method==="CASH"?"كاش":r.method==="CLICK"?"كليك":"كوبونات"}</small></div><b dir="ltr">{r.method==="COUPON"?`${r.amount} كوبون`:money(r.amount)}</b></article>):<p className={styles.empty}>لا توجد تحصيلات</p>}</div>}
      <Link className={styles.profile} href={`/admin/customers/${encodeURIComponent(customer.customerId)}`}>ملف العميل<AlfanarIcon name="arrow-left"/></Link>
    </>}
  </aside>;
}
