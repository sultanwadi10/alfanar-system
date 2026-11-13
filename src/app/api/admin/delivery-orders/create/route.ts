import { withOperationChanges } from "@/lib/updates/operation-changes";
import { InventoryError } from "@/lib/inventory/stock-engine";
import { NextResponse } from "next/server";

import { createAdminDeliveryOrder } from "@/lib/orders/admin-order-creation";
import { DeliveryOrderBusinessError } from "@/lib/orders/delivery-order-repository";
import { createDeliveryOrderSchema } from "@/lib/orders/delivery-order-validation";
import { getAdminSecurityContext } from "@/lib/security/get-admin-security-context";
import { hasValidOrigin } from "@/lib/security/has-valid-origin";
import { isSecurityError } from "@/lib/security/is-security-error";
import { toSecurityResponse } from "@/lib/security/to-security-response";

function failure(message: string, code: string, status: number) {
  return NextResponse.json(
    { success: false, error: { code, message } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

async function handlePOST(request: Request) {
  try {
    const admin = await getAdminSecurityContext();
    if (!hasValidOrigin(request)) {
      return failure("الطلب غير مسموح.", "FORBIDDEN", 403);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return failure("بيانات الطلب غير صالحة.", "INVALID_INPUT", 400);
    }
    const parsed = createDeliveryOrderSchema.safeParse(body);
    if (!parsed.success) {
      return failure(parsed.error.issues[0]?.message ?? "تحقق من بيانات الطلب.", "VALIDATION_ERROR", 400);
    }

    const result = await createAdminDeliveryOrder(parsed.data,admin.authUid);

    // Employee receives only public order number and payment progress.
    // Internal booklet ids, balances, allocations and history are NEVER returned.
    return NextResponse.json(
      { success: true, data: result },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if ((error instanceof DeliveryOrderBusinessError || error instanceof InventoryError)) {
      return failure(error.message, error.code, 409);
    }
    if (isSecurityError(error)) return toSecurityResponse(error);
    console.error("Create delivery order failed:", error);
    return failure("تعذر حفظ طلب التوصيل. حاول مرة أخرى.", "INTERNAL_ERROR", 500);
  }
}

export const POST = withOperationChanges(handlePOST, ["orders","inventory","home"]);
