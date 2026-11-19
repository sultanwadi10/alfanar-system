import { NextResponse } from "next/server";
import { z } from "zod";
import { correctOrderPayment } from "@/lib/receivables/payment-correction";
import { ReceivableError } from "@/lib/receivables/records";
import { getAdminSecurityContext } from "@/lib/security/get-admin-security-context";
import { hasValidOrigin } from "@/lib/security/has-valid-origin";
import { isSecurityError } from "@/lib/security/is-security-error";
import { toSecurityResponse } from "@/lib/security/to-security-response";
import { withOperationChanges } from "@/lib/updates/operation-changes";
const schema=z.object({requestId:z.string().uuid(),orderId:z.string().regex(/^\d{8}-\d{3,8}$/),method:z.enum(["CASH","CLICK","COUPON"]),remainderMethod:z.enum(["CASH","CLICK"]),expectedMoneyDueFils:z.number().int().min(0),expectedCouponQuantity:z.number().int().min(0)}).strict();
async function handlePOST(request:Request,context:{params:Promise<{customerId:string}>}){try{const admin=await getAdminSecurityContext();if(!hasValidOrigin(request))return NextResponse.json({success:false},{status:403});const parsed=schema.safeParse(await request.json().catch(()=>null)),{customerId}=await context.params;if(!parsed.success||!/^[A-Za-z0-9_-]{1,128}$/.test(customerId))return NextResponse.json({success:false,error:{message:"تحقق من بيانات التصحيح."}},{status:400});return NextResponse.json({success:true,data:await correctOrderPayment({...parsed.data,customerId,adminUid:admin.authUid})});}catch(error){if(isSecurityError(error))return toSecurityResponse(error);if(error instanceof ReceivableError)return NextResponse.json({success:false,error:{message:error.message}},{status:409});console.error("Payment correction failed",error);return NextResponse.json({success:false,error:{message:"تعذر تصحيح الدفع."}},{status:500});}}
export const POST=withOperationChanges(handlePOST,["orders","home"]);
