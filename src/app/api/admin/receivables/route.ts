import { NextResponse } from "next/server";
import { receivablesDirectory } from "@/lib/receivables/directory";
import { getAdminSecurityContext } from "@/lib/security/get-admin-security-context";
import { isSecurityError } from "@/lib/security/is-security-error";
import { toSecurityResponse } from "@/lib/security/to-security-response";
import { z } from "zod";
import { createManualDebt } from "@/lib/receivables/manual-debt";
import { ReceivableError } from "@/lib/receivables/records";
import { hasValidOrigin } from "@/lib/security/has-valid-origin";
import { withOperationChanges } from "@/lib/updates/operation-changes";
export async function GET(){try{await getAdminSecurityContext();return NextResponse.json({success:true,data:await receivablesDirectory()},{headers:{"Cache-Control":"private, no-store"}});}catch(error){if(isSecurityError(error))return toSecurityResponse(error);console.error("Receivables directory failed",error);return NextResponse.json({success:false,error:{message:"تعذر تحميل مستحقات العملاء."}},{status:500});}}
const schema=z.object({requestId:z.string().uuid(),customerId:z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),amount:z.number().int().min(1).max(100_000_000)}).strict();
async function handlePOST(request:Request){try{const admin=await getAdminSecurityContext();if(!hasValidOrigin(request))return NextResponse.json({success:false,error:{message:"العملية غير مسموحة."}},{status:403});const input=schema.safeParse(await request.json().catch(()=>null));if(!input.success)return NextResponse.json({success:false,error:{message:"اختر العميل وأدخل مبلغًا صحيحًا."}},{status:400});return NextResponse.json({success:true,data:await createManualDebt({...input.data,adminUid:admin.authUid})},{headers:{"Cache-Control":"private, no-store"}});}catch(error){if(isSecurityError(error))return toSecurityResponse(error);if(error instanceof ReceivableError)return NextResponse.json({success:false,error:{code:error.code,message:error.message}},{status:409});console.error("Manual receivable failed",error);return NextResponse.json({success:false,error:{message:"تعذر تسجيل المستحق."}},{status:500});}}
export const POST=withOperationChanges(handlePOST,["orders","home"]);
