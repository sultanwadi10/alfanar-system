import { NextResponse } from "next/server";
import { receivablesDirectory } from "@/lib/receivables/directory";
import { getAdminSecurityContext } from "@/lib/security/get-admin-security-context";
import { isSecurityError } from "@/lib/security/is-security-error";
import { toSecurityResponse } from "@/lib/security/to-security-response";
export async function GET(){try{await getAdminSecurityContext();return NextResponse.json({success:true,data:await receivablesDirectory()},{headers:{"Cache-Control":"private, no-store"}});}catch(error){if(isSecurityError(error))return toSecurityResponse(error);console.error("Receivables directory failed",error);return NextResponse.json({success:false,error:{message:"تعذر تحميل مستحقات العملاء."}},{status:500});}}
