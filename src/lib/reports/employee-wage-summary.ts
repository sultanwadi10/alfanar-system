import type { ShiftReportRow,ReportEmployee } from "@/types/admin-reports";
export type EmployeeWageSummary={id:string;employeeId:string|null;employee:string;totalFils:number;shiftCount:number;recordedCount:number;unknownCount:number;lastReceiptAt:string|null;shifts:ShiftReportRow[]};
export function summarizeEmployeeWages(shifts:readonly ShiftReportRow[],employees:readonly ReportEmployee[]=[]):EmployeeWageSummary[]{
 const groups=new Map<string,EmployeeWageSummary>(),names=new Map(employees.map(e=>[e.id,e.name]));
 for(const e of employees)if(e.active)groups.set("employee:"+e.id,{id:"employee:"+e.id,employeeId:e.id,employee:e.name,totalFils:0,shiftCount:0,recordedCount:0,unknownCount:0,lastReceiptAt:null,shifts:[]});
 for(const shift of shifts){
  const employeeId=typeof shift.employeeId==="string"&&shift.employeeId.trim()?shift.employeeId:null;
  // Missing historical identities remain separate; matching names do not prove one employee.
  const id=employeeId?"employee:"+employeeId:"legacy:"+shift.id;
  const row=groups.get(id)??{id,employeeId,employee:shift.employee,totalFils:0,shiftCount:0,recordedCount:0,unknownCount:0,lastReceiptAt:null,shifts:[]};
  row.shifts.push(shift);row.shiftCount++;
  if(shift.wageStatus==="ALREADY_PAID"){if(shift.wage!==0)throw Error("Invalid repeated employee wage");}
  else if(shift.wage==null)row.unknownCount++;
  else{
   if(!Number.isSafeInteger(shift.wage)||shift.wage<0||!Number.isSafeInteger(row.totalFils+shift.wage))throw Error("Invalid recorded employee wage");
   row.totalFils+=shift.wage;row.recordedCount++;
   if(!row.lastReceiptAt||shift.closedAt>row.lastReceiptAt)row.lastReceiptAt=shift.closedAt;
  }
  groups.set(id,row);
 }
 for(const row of groups.values()){
  row.shifts.sort((a,b)=>b.closedAt.localeCompare(a.closedAt)||a.id.localeCompare(b.id));
  row.employee=(row.employeeId?names.get(row.employeeId):null)??row.shifts[0]?.employee??row.employee;
 }
 return [...groups.values()].sort((a,b)=>a.employee.localeCompare(b.employee,"ar")||a.id.localeCompare(b.id));
}
