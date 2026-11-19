import { NextResponse } from "next/server";
import { z } from "zod";
import { getPrivateBottles,savePrivateBottles } from "@/lib/customers/private-bottles";
import { getAdminSecurityContext } from "@/lib/security/get-admin-security-context";
import { hasValidOrigin } from "@/lib/security/has-valid-origin";
import { isSecurityError } from "@/lib/security/is-security-error";
import { toSecurityResponse } from "@/lib/security/to-security-response";
import { InventoryError } from "@/lib/inventory/stock-engine";
type Context={params:Promise<{customerId:string}>};
const headers={"Cache-Control":"private, no-store"};
const schema=z.object({rows:z.array(z.object({origin:z.enum(["JORDANIAN","SAUDI"]),sizeMl:z.number().int().min(1).max(100000),owned:z.number().int().min(0).max(100000)}).strict()).max(20)}).strict();
function failure(error:unknown){if(isSecurityError(error))return toSecurityResponse(error);if(error instanceof InventoryError)return NextResponse.json({success:false,error:{message:error.message}},{status:409,headers});console.error("Private bottles failed",error);return NextResponse.json({success:false,error:{message:"تعذر تحميل أو حفظ القوارير الخاصة."}},{status:500,headers});}
function validId(id:string){if(!/^[A-Za-z0-9_-]{1,128}$/.test(id))throw new InventoryError("INVALID_ID","معرف العميل غير صالح.");}
export async function GET(_request:Request,context:Context){try{await getAdminSecurityContext();const {customerId}=await context.params;validId(customerId);return NextResponse.json({success:true,data:await getPrivateBottles(customerId)},{headers});}catch(error){return failure(error);}}
export async function PUT(request:Request,context:Context){try{const admin=await getAdminSecurityContext();if(!hasValidOrigin(request))return NextResponse.json({success:false},{status:403});const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({success:false,error:{message:"تحقق من الأعداد."}},{status:400});const {customerId}=await context.params;validId(customerId);return NextResponse.json({success:true,data:await savePrivateBottles(customerId,parsed.data.rows,admin.authUid)},{headers});}catch(error){return failure(error);}}
