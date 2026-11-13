import { withOperationChanges } from "@/lib/updates/operation-changes";
import { NextResponse } from "next/server";
import { getAdminSecurityContext } from "@/lib/security/get-admin-security-context";
import { hasValidOrigin } from "@/lib/security/has-valid-origin";
import { isSecurityError } from "@/lib/security/is-security-error";
import { toSecurityResponse } from "@/lib/security/to-security-response";
import { convertBookletSerials,previewBookletSerialConversion } from "@/lib/coupons/booklet-serials";
import { BookletError } from "@/lib/coupons/booklet-error";
export const dynamic="force-dynamic";
async function run(request?:Request){try{const admin=await getAdminSecurityContext();if(request&&!hasValidOrigin(request))return NextResponse.json({success:false,error:{message:"الطلب غير مسموح."}},{status:403});const data=request?await convertBookletSerials(admin.authUid):await previewBookletSerialConversion();return NextResponse.json({success:true,data},{headers:{"Cache-Control":"private, no-store"}});}catch(error){if(isSecurityError(error))return toSecurityResponse(error);console.error("Booklet serial conversion failed",error);return NextResponse.json({success:false,error:{message:error instanceof BookletError?error.message:"تعذّر تحويل الأرقام."}},{status:error instanceof BookletError?409:500});}}
export async function GET(){return run();}async function handlePOST(request:Request){return run(request);}

export const POST = withOperationChanges(handlePOST, ["orders","inventory","home","catalog"]);
