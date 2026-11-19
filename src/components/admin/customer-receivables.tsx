"use client";
import { PaymentCorrection,type CorrectableOrder } from "./payment-correction";
import { userMessage } from "@/lib/client/user-message";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AdminDialog } from "./admin-dialog";
import { newRequestId } from "@/lib/client/request-id";
import styles from "./management.module.css";
type Debt={id:string;orderId:string;orderNumber:string;kind:"MONEY"|"COUPON";outstanding:number;original:number;settled:number;at:string|null};
type Account={correctableOrders:CorrectableOrder[];moneyDueFils:number;couponsDue:number;availableCoupons:number;partial:boolean;outstanding:Debt[];receipts:Array<{id:string;orderNumber:string;amount:number;method:string;at:string|null}>};
const money=(n:number)=>(n/1000).toFixed(3)+" د.أ";
const date=(s:string|null)=>s?new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Amman",dateStyle:"medium",timeStyle:"short"}).format(new Date(s)):"—";
export function CustomerReceivables({customerId,onChanged}:{customerId:string;onChanged?:()=>void}) {
  const [account,setAccount]=useState<Account|null>(null),[error,setError]=useState(""),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false);
  const [selected,setSelected]=useState<Debt|null>(null),[value,setValue]=useState(""),[method,setMethod]=useState<"CASH"|"CLICK"|"COUPON">("CASH");
  const request=useRef<{key:string;id:string}|null>(null),generation=useRef(0);
  const endpoint=`/api/admin/customers/${encodeURIComponent(customerId)}/receivables`;
  const load=useCallback(async()=>{
    const token=++generation.current;setLoading(true);
    try{const response=await fetch(endpoint,{cache:"no-store"}),result=await response.json();if(!response.ok||!result.success)throw Error(result.error?.message??"تعذّر تحميل المستحقات.");if(token===generation.current){setAccount(result.data);setError("");}}
    catch(e){if(token===generation.current)setError(userMessage(e instanceof Error?e.message:"تعذّر التحميل."));}
    finally{if(token===generation.current)setLoading(false);}
  },[endpoint]);
  useEffect(()=>{const tracker=generation;const timer=setTimeout(()=>void load(),0);return ()=>{clearTimeout(timer);++tracker.current;};},[load]);
  async function settle(event:React.FormEvent) {
    event.preventDefault();if(!selected||busy)return;
    const amount=selected.kind==="COUPON"?Number(value):Math.round(Number(value)*1000);
    if(!Number.isSafeInteger(amount)||amount<1||amount>selected.outstanding||!(selected.kind==="COUPON"?/^\d+$/:/^\d+(\.\d{1,3})?$/).test(value)){setError(userMessage("أدخل قيمة صحيحة ضمن المستحق."));return;}
    const key=JSON.stringify([selected.id,amount,method]);if(request.current?.key!==key)request.current={key,id:newRequestId()};
    setBusy(true);setError("");
    try {const response=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({receivableId:selected.id,requestId:request.current.id,amount,method})}),result=await response.json();if(!response.ok||!result.success)throw Error(result.error?.message??"تعذّر تسجيل التسديد.");request.current=null;setSelected(null);await load();onChanged?.();}
    catch(e){setError(userMessage(e instanceof Error?e.message:"تعذّر تسجيل التسديد."));}finally{setBusy(false);}
  }
  return <section className={styles.page} dir="rtl" style={{marginBlock:20}}><div className={styles.card}>
    <header className={styles.sectionHeader}><h2>مستحقات العميل</h2><button type="button" disabled={loading||busy} onClick={()=>void load()}>تحديث</button></header>
    <div className={styles.body}>
      {error&&<p role="alert">{error}</p>}{loading&&!account&&<p role="status">جارٍ تحميل المستحقات…</p>}
      {account&&<><div className={styles.kpis}><div className={styles.kpi}><span>مبالغ مستحقة</span><strong>{money(account.moneyDueFils)}</strong></div><div className={styles.kpi}><span>كوبونات مستحقة</span><strong>{account.couponsDue}</strong></div><div className={styles.kpi}><span>كوبونات متاحة</span><strong>{account.availableCoupons}</strong></div></div>
      {account.partial&&<p role="alert">النتائج جزئية لكثرة السجلات؛ الأرقام المعروضة لا تشمل كامل الحساب.</p>}
      <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>الطلب</th><th>تاريخ التسليم</th><th>نوع المستحق</th><th>المتبقي</th><th>التسديد</th></tr></thead><tbody>{account.outstanding.map(row=><tr key={row.id}><td><Link href={`/admin/orders?order=${encodeURIComponent(row.orderId)}`}>#{row.orderNumber}</Link></td><td>{date(row.at)}</td><td>{row.kind==="COUPON"?"كوبونات":"مبلغ مالي"}</td><td>{row.kind==="COUPON"?row.outstanding+" كوبون":money(row.outstanding)}</td><td><button type="button" disabled={busy} onClick={()=>{setSelected(row);setValue(row.kind==="COUPON"?String(row.outstanding):(row.outstanding/1000).toFixed(3));setMethod(row.kind==="COUPON"?"COUPON":"CASH");setError("");}}>تسجيل تسديد</button></td></tr>)}</tbody></table></div>
      <PaymentCorrection customerId={customerId} orders={account.correctableOrders??[]} availableCoupons={account.availableCoupons} onSaved={()=>{void load();onChanged?.();}}/>
      {!account.outstanding.length&&<p>لا توجد مستحقات متبقية.</p>}
      {account.receipts.length>0&&<><h3>التسديدات المسجلة</h3><div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>الطلب</th><th>التاريخ</th><th>طريقة التسديد</th><th>القيمة</th></tr></thead><tbody>{account.receipts.map(row=><tr key={row.id}><td>#{row.orderNumber}</td><td>{date(row.at)}</td><td>{row.method==="COUPON"?"كوبونات":row.method==="CASH"?"كاش":"كليك / تحويل"}</td><td>{row.method==="COUPON"?row.amount+" كوبون":money(row.amount)}</td></tr>)}</tbody></table></div></>}
      </>}
    </div></div>
    {selected&&<AdminDialog title={`تسديد مستحق الطلب #${selected.orderNumber}`} busy={busy} onClose={()=>setSelected(null)}><form className={styles.form} onSubmit={settle}><label>القيمة {selected.kind==="COUPON"?"بالكوبونات":"بالدينار"}<input inputMode="decimal" value={value} onChange={e=>setValue(e.target.value)} disabled={busy} autoFocus/></label>{selected.kind==="MONEY"&&<label>طريقة التسديد<select value={method} onChange={e=>setMethod(e.target.value as "CASH"|"CLICK")} disabled={busy}><option value="CASH">كاش</option><option value="CLICK">كليك / تحويل</option></select></label>}{error&&<p role="alert">{error}</p>}<button type="submit" className={styles.primary} disabled={busy}>{busy?"جارٍ التسجيل…":"تأكيد التسديد"}</button></form></AdminDialog>}
  </section>;
}
