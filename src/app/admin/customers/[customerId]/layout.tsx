import type { ReactNode } from "react";
// Wallet and ledger now render inside the customer profile itself.
// Admin auth is enforced by the parent /admin layout.
export default function CustomerDetailsLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
