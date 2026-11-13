import { redirect } from "next/navigation";
import InventoryManager, { type Tab } from "./inventory-manager";
export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ tab?: string; customer?: string }> }) {
  const query = await searchParams;
  if (query.tab === "settings") redirect("/admin/pricing");
  if (query.tab === "cooler") redirect("/admin/cooler");
  const allowed = ["stock", "pools", "materials", "debts", "movements"];
  const tab = allowed.includes(query.tab ?? "") ? query.tab as Tab : "stock";
  return <InventoryManager key={`${tab}:${query.customer ?? ""}`} initialTab={tab} customerId={query.customer}/>;
}
