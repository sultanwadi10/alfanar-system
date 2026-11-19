import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSecurityContext } from "@/lib/security/get-admin-security-context";
import { hasValidOrigin } from "@/lib/security/has-valid-origin";
import { isSecurityError } from "@/lib/security/is-security-error";
import { toSecurityResponse } from "@/lib/security/to-security-response";
import { withOperationChanges } from "@/lib/updates/operation-changes";
import { employeeScheduleSchema,shiftTimeSettingsSchema } from "@/lib/validation/employee-schedule";
import { getRosterWeek,saveRosterWeek,RosterError } from "@/lib/employees/roster-repository";
import { rosterWeekStart,validRosterWeek } from "@/lib/employees/roster-week";
const headers={"Cache-Control":"private, no-store"};
const schema=z.object({requestId:z.string().uuid(),weekStart:z.string().refine(validRosterWeek),expectedRevision:z.number().int().min(0),settings:shiftTimeSettingsSchema,schedules:z.record(z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),employeeScheduleSchema).refine(value=>Object.keys(value).length<=150)}).strict();
function failure(error:unknown){if(isSecurityError(error))return toSecurityResponse(error);if(error instanceof RosterError)return NextResponse.json({success:false,error:{code:error.code,message:error.message}},{status:409,headers});console.error("Weekly roster failed",error);return NextResponse.json({success:false,error:{message:"تعذر تحميل أو حفظ جدول الدوام."}},{status:500,headers});}
export async function GET(request:Request){try{await getAdminSecurityContext();const weekStart=new URL(request.url).searchParams.get("weekStart")??rosterWeekStart();if(!validRosterWeek(weekStart))return NextResponse.json({success:false,error:{message:"تاريخ الأسبوع غير صالح."}},{status:400,headers});return NextResponse.json({success:true,data:await getRosterWeek(weekStart)},{headers});}catch(error){return failure(error);}}
async function handlePUT(request:Request){try{const admin=await getAdminSecurityContext();if(!hasValidOrigin(request))return NextResponse.json({success:false,error:{message:"الطلب غير مسموح."}},{status:403,headers});const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({success:false,error:{message:parsed.error.issues[0]?.message??"تحقق من الجدول والمواعيد."}},{status:400,headers});return NextResponse.json({success:true,data:await saveRosterWeek(parsed.data,admin.authUid)},{headers});}catch(error){return failure(error);}}
export const PUT=withOperationChanges(handlePUT,["home"]);
