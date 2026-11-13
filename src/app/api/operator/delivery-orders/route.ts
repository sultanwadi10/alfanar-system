import { withOperationChanges } from "@/lib/updates/operation-changes";
import { InventoryError } from "@/lib/inventory/stock-engine";
import { NextResponse } from "next/server";

import { resolveOperatorSession } from "@/lib/auth/operator-session";
import { createDeliveryOrder, DeliveryOrderBusinessError } from "@/lib/orders/delivery-order-repository";
import { listEmployeeTodayOrders } from "@/lib/orders/delivery-order-operations";
import { getFirebaseAdminFirestore } from "@/lib/firebase/admin";
import { createDeliveryOrderSchema } from "@/lib/orders/delivery-order-validation";
import { getStoreSecurityContext } from "@/lib/security/get-store-security-context";
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
    const store = await getStoreSecurityContext();
    const operator = await resolveOperatorSession(store.authUid);
    if (!operator) {
      return failure("يجب تسجيل دخول الموظف.", "OPERATOR_REQUIRED", 401);
    }
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

    const result = await createDeliveryOrder(parsed.data, {
      storeAuthUid: store.authUid,
      employeeId: operator.employeeId,
      employeeName: operator.employeeName,
    });

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

export async function GET() {
  try {
    const store = await getStoreSecurityContext();
    const operator = await resolveOperatorSession(store.authUid);
    if (!operator) {
      return failure("يجب تسجيل دخول الموظف.", "OPERATOR_REQUIRED", 401);
    }
    const [result, priceSnapshot] = await Promise.all([
      listEmployeeTodayOrders(store.authUid),
      getFirebaseAdminFirestore().collection("couponBookletSettings").doc("standard").get(),
    ]);
    const rawPrice = priceSnapshot.data()?.priceFils;
    const bookletPriceFils = Number.isSafeInteger(rawPrice) && rawPrice > 0 ? rawPrice as number : null;
    return NextResponse.json(
      { success: true, data: { ...result, bookletPriceFils } },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (isSecurityError(error)) return toSecurityResponse(error);
    console.error("Load delivery orders failed:", error);
    return failure("تعذر تحميل طلبات اليوم.", "INTERNAL_ERROR", 500);
  }
}

export const POST = withOperationChanges(handlePOST, ["orders","inventory","home"]);
