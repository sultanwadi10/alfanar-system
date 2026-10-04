export const PERMISSIONS = {
  ADMIN_ACCESS: "admin.access",
  EMPLOYEE_ACCESS: "employee.access",

  EMPLOYEES_MANAGE: "employees.manage",
  PRICING_MANAGE: "pricing.manage",
  SYSTEM_SETTINGS_MANAGE: "system-settings.manage",
  AUDIT_LOG_READ: "audit-log.read",

  SHIFT_OPERATE: "shift.operate",
  CUSTOMER_LOOKUP: "customer.lookup",
  ORDER_CREATE: "order.create",

  COUPON_CREDIT: "coupon.credit",
  COUPON_DEBIT: "coupon.debit",

  CASH_RECONCILE: "cash.reconcile",
  SALES_INVOICE_PRINT: "sales-invoice.print",
} as const;

export type Permission =
  (typeof PERMISSIONS)[keyof typeof PERMISSIONS];