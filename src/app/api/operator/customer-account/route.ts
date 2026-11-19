import { NextResponse } from "next/server";
import { resolveOperatorSession } from "@/lib/auth/operator-session";
import { getStoreSecurityContext } from "@/lib/security/get-store-security-context";
import { isSecurityError } from "@/lib/security/is-security-error";
import { toSecurityResponse } from "@/lib/security/to-security-response";
import { customerAccount } from "@/lib/receivables/service";
import { ReceivableError } from "@/lib/receivables/records";
const headers={"Cache-Control":"private, no-store"};
export async function GET(request:Request) {
  try {
    const store=await getStoreSecurityContext();
    if(!await resolveOperatorSession(store.authUid)) return NextResponse.json({success:false,error:{message:"سجّل دخول الموظف."}},{status:401,headers});
    const account=await customerAccount(new URL(request.url).searchParams.get("customerId")??"",store.authUid);
    const {moneyDueFils,couponsDue,availableCoupons,partial,privateBottles}=account;
    return NextResponse.json({success:true,data:{moneyDueFils,couponsDue,availableCoupons,partial,privateBottles}},{headers});
  } catch(error) {
    if(isSecurityError(error)) return toSecurityResponse(error);
    if(error instanceof ReceivableError) return NextResponse.json({success:false,error:{message:error.message}},{status:409,headers});
    console.error("Customer account reminder failed",error);
    return NextResponse.json({success:false,error:{message:"تعذّر تحميل رصيد العميل."}},{status:500,headers});
  }
}
