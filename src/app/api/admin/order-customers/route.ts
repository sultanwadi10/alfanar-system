import { customerSpecialDeliveryPrice } from "@/lib/customers/delivery-pricing";
import { NextResponse } from "next/server";

import {
  createCustomerRecord,
  CustomerPhoneAlreadyExistsError,
} from "@/lib/customers/customer-repository";
import { formatJordanPhoneLocal } from "@/lib/customers/customer-phone";
import { getFirebaseAdminFirestore } from "@/lib/firebase/admin";
import { getAdminSecurityContext } from "@/lib/security/get-admin-security-context";
import { hasValidOrigin } from "@/lib/security/has-valid-origin";
import { isSecurityError } from "@/lib/security/is-security-error";
import { toSecurityResponse } from "@/lib/security/to-security-response";
import { customerNameSchema, customerPhoneSchema } from "@/lib/validation/customer";
import { z } from "zod";

export const dynamic = "force-dynamic";

// Do not return Customer objects here. Those include private admin notes,
// coupon balances, application identifiers and auditing information.
function publicCustomer(customer: {
  id: string;
  name: string;
  phone: string;
  primaryAddress: string;
  specialDelivery20LPriceFils?: number | null;
}) {
  return {
    specialDelivery20LPriceFils: customerSpecialDeliveryPrice(customer),
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    primaryAddress: customer.primaryAddress,
  };
}



function failure(message: string, code: string, status: number) {
  return NextResponse.json(
    { success: false, error: { code, message } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(request: Request) {
  try {
    await getAdminSecurityContext();
    const params = new URL(request.url).searchParams;
    const customerId = params.get("id")?.trim();
    if (customerId) {
      if (!/^[a-zA-Z0-9_-]{1,128}$/.test(customerId)) {
        return failure("طلب عميل غير صالح.", "INVALID_CUSTOMER", 400);
      }
      const doc = await getFirebaseAdminFirestore().collection("customers").doc(customerId).get();
      const record = doc.data();
      if (!record || record.isArchived === true) {
        return failure("العميل غير متاح.", "NOT_FOUND", 404);
      }
      const customer = publicCustomer({
        specialDelivery20LPriceFils: customerSpecialDeliveryPrice(record),
        id: doc.id,
        name: record.name,
        phone: formatJordanPhoneLocal(record.phoneNormalized),
        primaryAddress: typeof record.primaryAddress === "string" ? record.primaryAddress : "",
      });
      return NextResponse.json(
        { success: true, data: { customers: [customer] } },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }
    const query = params.get("q")?.trim() ?? "";
    if (query.length < 2 || query.length > 80) {
      return NextResponse.json(
        { success: true, data: { customers: [] } },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    // Projection intentionally excludes adminNotes, couponBalance, history,
    // booklet identifiers and all other administrative information.
    // For a larger database, replace the in-memory name filter with a search index.
    const snapshot = await getFirebaseAdminFirestore()
      .collection("customers")
      .select("name", "phoneNormalized", "primaryAddress", "isArchived", "specialDelivery20LPriceFils")
      .get();
    const customers = snapshot.docs.flatMap((doc) => {
      const data = doc.data();
      if (data.isArchived === true || typeof data.name !== "string" ||
          typeof data.phoneNormalized !== "string") return [];
      return [{
        specialDelivery20LPriceFils: customerSpecialDeliveryPrice(data),
        id: doc.id,
        name: data.name as string,
        phone: formatJordanPhoneLocal(data.phoneNormalized as string),
        primaryAddress: typeof data.primaryAddress === "string" ? data.primaryAddress : "",
      }];
    });
    const normalizedQuery = query.toLocaleLowerCase("ar");
    const digits = query.replace(/\D/g, "");

    const matching = customers
      .filter((customer) => {
        const nameMatch = customer.name
          .toLocaleLowerCase("ar")
          .includes(normalizedQuery);
        const phoneMatch = digits.length >= 2 &&
          customer.phone.replace(/\D/g, "").includes(digits);
        return nameMatch || phoneMatch;
      })
      .slice(0, 8)
      .map(publicCustomer);

    return NextResponse.json(
      { success: true, data: { customers: matching } },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (isSecurityError(error)) return toSecurityResponse(error);
    console.error("Operator customer search failed:", error);
    return failure("تعذر البحث عن العملاء.", "INTERNAL_ERROR", 500);
  }
}

const createSchema = z.object({
  name: customerNameSchema,
  phone: customerPhoneSchema,
  primaryAddress: z.string().trim().min(5, "أدخل عنوانًا واضحًا.").max(250),
}).strict();

export async function POST(request: Request) {
  try {
    const admin=await getAdminSecurityContext();
    if (!hasValidOrigin(request)) {
      return failure("الطلب غير مسموح.", "FORBIDDEN", 403);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return failure("بيانات العميل غير صالحة.", "INVALID_INPUT", 400);
    }
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return failure(parsed.error.issues[0]?.message ?? "تحقق من بيانات العميل.", "VALIDATION_ERROR", 400);
    }

    const created = await createCustomerRecord({
      name: parsed.data.name,
      phoneNormalized: parsed.data.phone,
      primaryAddress: parsed.data.primaryAddress,
      adminNotes: "",
      creator: {
        source: "ADMIN",
        authUid: admin.authUid,
      },
    });
    return NextResponse.json(
      { success: true, data: { customer: publicCustomer(created) } },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof CustomerPhoneAlreadyExistsError) {
      return failure("رقم الهاتف مسجّل مسبقًا. ابحث عن العميل واختره.", "PHONE_EXISTS", 409);
    }
    if (isSecurityError(error)) return toSecurityResponse(error);
    console.error("Operator customer creation failed:", error);
    return failure("تعذر تسجيل العميل.", "INTERNAL_ERROR", 500);
  }
}
