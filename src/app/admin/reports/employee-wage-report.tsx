"use client";
import { useMemo,useState } from "react";
import { AlfanarIcon } from "@/components/admin/alfanar-icon";
import { AdminDialog } from "@/components/admin/admin-dialog";
import { DataTable } from "@/components/admin/report-data-table";
import { summarizeEmployeeWages } from "@/lib/reports/employee-wage-summary";
import { dinars } from "@/lib/format/money-input";
import type { ShiftReportRow,ReportEmployee } from "@/types/admin-reports";
import styles from "@/components/admin/management.module.css";
const money=(value:number)=><span className={styles.money}><bdi>{dinars(value)}</bdi> د.أ</span>;
const when=(at:string)=>new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Amman",year:"numeric",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date(at));
const period=(row:ShiftReportRow)=>row.shiftType==="MORNING"?"صباحي":row.shiftType==="EVENING"?"مسائي":"غير محدد";
export function EmployeeWageReport({shifts,employees=[]}:{shifts:ShiftReportRow[];employees?:ReportEmployee[]}){
 const [employee,setEmployee]=useState("all"),[query,setQuery]=useState(""),[detailId,setDetailId]=useState<string|null>(null);
 const summaries=useMemo(()=>summarizeEmployeeWages(shifts,employees),[shifts,employees]);
 const activeEmployee=summaries.some(s=>s.id===employee)?employee:"all";
 const rows=summaries.filter(s=>(activeEmployee==="all"||s.id===activeEmployee)&&s.employee.toLocaleLowerCase("ar").includes(query.trim().toLocaleLowerCase("ar")));
 const totalFils=rows.reduce((sum,row)=>sum+row.totalFils,0),count=rows.reduce((sum,row)=>sum+row.recordedCount,0),unknown=rows.reduce((sum,row)=>sum+row.unknownCount,0);
 const selected=summaries.find(s=>s.id===detailId);
 const tools=<div className={styles.actions}><select aria-label="الموظف" value={activeEmployee} onChange={e=>setEmployee(e.target.value)}><option value="all">كل الموظفين</option>{summaries.map(s=><option key={s.id} value={s.id}>{s.employee}{!s.employeeId?" — سجل قديم":""}</option>)}</select><input className={styles.search} type="search" aria-label="البحث في يوميات الموظفين" placeholder="اسم الموظف" value={query} onChange={e=>setQuery(e.target.value)}/></div>;
 return <>
  <div className={styles.kpis}>
   <article className={styles.kpi}><span>اليوميات المسجّلة<AlfanarIcon name="coins" size={25}/></span><strong>{money(totalFils)}</strong></article>
   <article className={styles.kpi}><span>الموظفون<AlfanarIcon name="users" size={25}/></span><strong>{rows.filter(r=>r.employeeId).length}</strong></article>
   <article className={styles.kpi}><span>مرات استلام اليومية<AlfanarIcon name="calendar" size={25}/></span><strong>{count}</strong></article>
   <article className={styles.kpi}><span>يوميات غير محددة<AlfanarIcon name="info" size={25}/></span><strong>{unknown}</strong></article>
  </div>
  <DataTable key={activeEmployee+":"+query} title="يوميات الموظفين" tools={tools} rows={rows} headers={["الموظف","مرات الاستلام","مجموع اليوميات","آخر استلام","التفاصيل"]} render={row=><>
   <td><strong>{row.employee}</strong>{!row.employeeId&&<small className={styles.warn}>هوية غير محددة</small>}</td>
   <td>{row.recordedCount}</td>
   <td>{!row.recordedCount&&row.unknownCount?<span className={styles.warn}>غير محددة</span>:money(row.totalFils)}{!!row.unknownCount&&<small className={styles.warn}>غير محددة: {row.unknownCount}</small>}</td>
   <td>{row.lastReceiptAt?when(row.lastReceiptAt):"—"}</td>
   <td><button type="button" disabled={!row.recordedCount&&!row.unknownCount} onClick={()=>setDetailId(row.id)}>عرض الاستلامات</button></td>
  </>}/>
  {selected&&<AdminDialog title={"يوميات — "+selected.employee} wide onClose={()=>setDetailId(null)}>
   <DataTable key={selected.id} title="سجل الاستلامات" rows={selected.shifts.filter(s=>s.wageStatus!=="ALREADY_PAID")} headers={["تاريخ التسليم","الشفت","الاسم وقت التسجيل","اليومية"]} render={row=><><td>{when(row.closedAt)}</td><td>{period(row)}</td><td>{row.employee}</td><td>{row.wage===null?<span className={styles.warn}>غير محددة</span>:money(row.wage)}</td></>}/>
  </AdminDialog>}
 </>;
}
