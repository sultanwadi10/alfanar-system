import { NextResponse } from "next/server";
import { z } from "zod";
import { customerAccount, settleReceivable } from "@/lib/receivables/service";
import { settleReceivablesBatch } from "@/lib/receivables/settle-batch";
import { ReceivableError } from "@/lib/receivables/records";
import { getAdminSecurityContext } from "@/lib/security/get-admin-security-context";
import { hasValidOrigin } from "@/lib/security/has-valid-origin";
import { isSecurityError } from "@/lib/security/is-security-error";
import { toSecurityResponse } from "@/lib/security/to-security-response";
import { withOperationChanges } from "@/lib/updates/operation-changes";
const headers = { "Cache-Control": "private, no-store" };
type Context = { params: Promise<{ customerId: string }> };
const singleSchema = z.object({ requestId:z.string().uuid(), receivableId:z.string().regex(/^order_\d{8}-\d{3,8}$/), amount:z.number().int().min(1).max(1_000_000_000), method:z.enum(["CASH","CLICK","COUPON"]) }).strict();
const schema = z.union([singleSchema,z.object({requestId:z.string().uuid(),amount:z.number().int().min(1).max(100_000_000),method:z.enum(["CASH","CLICK"]),items:z.array(z.object({receivableId:z.string().regex(/^order_\d{8}-\d{3,8}$/),expectedOutstanding:z.number().int().min(1)}).strict()).min(1).max(100)}).strict()]);
function failure(error:unknown) {
  if (isSecurityError(error)) return toSecurityResponse(error);
  if (error instanceof ReceivableError) return NextResponse.json({success:false,error:{code:error.code,message:error.message}},{status:error.code==="NOT_FOUND"?404:409,headers});
  console.error("Customer receivables failed",error);
  return NextResponse.json({success:false,error:{message:"تعذّر تحميل أو تسجيل المستحقات."}},{status:500,headers});
}
export async function GET(_request:Request,context:Context) {
  try { await getAdminSecurityContext(); const {customerId}=await context.params; return NextResponse.json({success:true,data:await customerAccount(customerId)},{headers}); } catch(error) { return failure(error); }
}
async function handlePOST(request:Request,context:Context) {
  try {
    const admin=await getAdminSecurityContext();
    if(!hasValidOrigin(request)) return NextResponse.json({success:false,error:{message:"العملية غير مسموحة."}},{status:403,headers});
    const body=await request.json().catch(()=>null),parsed=schema.safeParse(body);
    if(!parsed.success) return NextResponse.json({success:false,error:{message:"تحقق من قيمة وطريقة التسديد."}},{status:400,headers});
    const {customerId}=await context.params;
    return NextResponse.json({success:true,data:await ("items" in parsed.data?settleReceivablesBatch({...parsed.data,customerId,adminUid:admin.authUid}):settleReceivable({...parsed.data,customerId,adminUid:admin.authUid}))},{headers});
  } catch(error) { return failure(error); }
}
export const POST=withOperationChanges(handlePOST,["orders","home"]);
