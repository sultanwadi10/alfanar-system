"use client";
import { useEffect, useId, useRef, useState } from "react";
import type { DashboardOverview } from "@/types/admin-overview";
import { AlfanarIcon } from "./alfanar-icon";
import styles from "./shift-history-picker.module.css";

type Shift=NonNullable<DashboardOverview["shifts"]>[number];
const typeName=(shift:Shift)=>shift.shiftType==="MORNING"?"صباحي":shift.shiftType==="EVENING"?"مسائي":"شفت";
const date=(at:string)=>new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Amman",day:"2-digit",month:"2-digit",year:"numeric"}).format(new Date(at));
const time=(at:string)=>new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Amman",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date(at));
export function ShiftHistoryPicker({shifts,selectedId,onSelect,disabled=false}:{shifts:Shift[];selectedId:string;onSelect:(id:string)=>void;disabled?:boolean}){
  const [open,setOpen]=useState(false),[query,setQuery]=useState("");
  const root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),search=useRef<HTMLInputElement>(null),options=useRef(new Map<string,HTMLButtonElement>()),id=useId();
  const selected=shifts.find(s=>s.id===selectedId),shown=shifts.filter(s=>`${s.employee} ${date(s.openedAt)} ${typeName(s)} ${s.closedAt?"مغلق":"مفتوح"}`.includes(query.trim()));
  useEffect(()=>{
    if(!open)return;
    search.current?.focus();
    const outside=(event:PointerEvent)=>{if(event.target instanceof Node&&!root.current?.contains(event.target))setOpen(false);};
    document.addEventListener("pointerdown",outside);return()=>document.removeEventListener("pointerdown",outside);
  },[open]);
  function close(){setOpen(false);trigger.current?.focus();}
  function navigate(event:React.KeyboardEvent){
    if(event.key==="Escape"){event.preventDefault();close();return;}
    if(!open&&["ArrowDown","ArrowUp"].includes(event.key)){event.preventDefault();setQuery("");setOpen(true);return;}
    const input=event.target===search.current;
    if(!["ArrowDown","ArrowUp","Home","End"].includes(event.key)||input&&["Home","End"].includes(event.key))return;
    event.preventDefault();if(!shown.length)return;
    const current=shown.findIndex(s=>options.current.get(s.id)===document.activeElement);
    const next=event.key==="Home"?0:event.key==="End"?shown.length-1:current<0?(event.key==="ArrowUp"?shown.length-1:0):(current+(event.key==="ArrowDown"?1:-1)+shown.length)%shown.length;
    options.current.get(shown[next].id)?.focus();
  }
  return <div className={styles.root} ref={root} onKeyDown={navigate}>
    <button className={styles.trigger} ref={trigger} type="button" disabled={disabled||!shifts.length} aria-haspopup="listbox" aria-expanded={open} aria-controls={id} onClick={()=>{setQuery("");setOpen(!open);}}>
      <span className={styles.icon}><AlfanarIcon name={selected?.shiftType==="EVENING"?"moon":"sun"} size={21}/></span><span className={styles.summary}><small>سجل الشفتات</small><strong>{selected?`${typeName(selected)} · ${selected.employee}`:"لا توجد شفتات"}</strong>{selected&&<span><bdi>{date(selected.openedAt)} · {time(selected.openedAt)}</bdi><i className={!selected.closedAt?styles.active:""}/>{selected.closedAt?"مغلق":"مفتوح"}</span>}</span><AlfanarIcon name={open?"chevron-up":"chevron-down"}/>
    </button>
    {open&&<div className={styles.popup}><label className={styles.search}><AlfanarIcon name="search"/><input ref={search} aria-label="البحث في الشفتات" placeholder="اسم الموظف أو التاريخ" value={query} onChange={e=>setQuery(e.target.value)}/></label>
      <div id={id} role="listbox" aria-label="سجل الشفتات" className={styles.list}>{shown.map(shift=><button key={shift.id} type="button" role="option" aria-selected={shift.id===selectedId} tabIndex={-1} ref={element=>{if(element)options.current.set(shift.id,element);else options.current.delete(shift.id);}} onClick={()=>{onSelect(shift.id);close();}}>
        <span className={`${styles.typeIcon} ${shift.shiftType==="EVENING"?styles.evening:styles.morning}`}><AlfanarIcon name={shift.shiftType==="EVENING"?"moon":"sun"}/></span><span className={styles.detail}><strong><span className={styles.employeeName}>{shift.employee}</span><small>{typeName(shift)}</small></strong><span dir="ltr">{date(shift.openedAt)} · {time(shift.openedAt)}</span></span><span className={`${styles.status} ${!shift.closedAt?styles.openStatus:""}`}>{shift.closedAt?"مغلق":"مفتوح"}</span>{shift.id===selectedId&&<AlfanarIcon className={styles.check} name="check" size={17}/>}</button>)}</div>{!shown.length&&<p className={styles.empty}>لا توجد شفتات مطابقة</p>}
    </div>}
  </div>;
}
