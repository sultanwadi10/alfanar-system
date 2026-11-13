import Link from "next/link";
import { getAdminSecurityContext } from "@/lib/security/get-admin-security-context";
import Review from "./review";
export const dynamic = "force-dynamic";
export default async function Page() { await getAdminSecurityContext(); return <><Link href="/admin/pricing">← الأصناف والأسعار</Link><Review/></>; }
