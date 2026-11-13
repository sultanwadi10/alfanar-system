"use client";
import { userMessage } from "@/lib/client/user-message";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./employee-customers.module.css";

type CustomerChoice = {
  id: string;
  name: string;
  phone: string;
  primaryAddress: string;
};

function errorMessage(data: unknown, fallback: string): string {
  if (data && typeof data === "object" && "error" in data &&
      data.error && typeof data.error === "object" && "message" in data.error &&
      typeof data.error.message === "string") return data.error.message;
  return fallback;
}

export default function EmployeeCustomers() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CustomerChoice[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<CustomerChoice | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");

  useEffect(() => {
    if (query.trim().length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(
          `/api/operator/customers?q=${encodeURIComponent(query.trim())}`,
          { cache: "no-store", signal: controller.signal },
        );
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(errorMessage(data, "تعذر البحث."));
        if (!controller.signal.aborted) {
          setResults(data.data?.customers ?? []);
          setError("");
        }
      } catch (cause) {
        if (!controller.signal.aborted) {
          setResults([]);
          setError(userMessage(cause instanceof Error ? cause.message : "تعذر البحث."));
        }
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 300);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query]);

  async function saveCustomer() {
    setError("");
    if (!/^07\d{8}$/.test(phone) || name.trim().length < 2 || address.trim().length < 5) {
      setError(userMessage("أدخل اسمًا من حرفين على الأقل ورقمًا يبدأ بـ07 وعنوانًا واضحًا."));
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/operator/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), phone, primaryAddress: address.trim() }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(errorMessage(data, "تعذر تسجيل العميل."));
      setCreated(data.data.customer);
      setShowForm(false);
      setName(""); setPhone(""); setAddress("");
    } catch (cause) {
      setError(userMessage(cause instanceof Error ? cause.message : "تعذر تسجيل العميل."));
    } finally {
      setSaving(false);
    }
  }

  function newDelivery(customer: CustomerChoice) {
    router.push(`/employee/orders/new?customerId=${encodeURIComponent(customer.id)}`);
  }

  return (
    <main className={styles.page} dir="rtl">
      <div className={styles.container}>
        <header className={styles.header}>
          <div>
            <span className={styles.eyebrow}>محطة الفنار / العملاء</span>
            <h1>العملاء</h1>

          </div>
          <div className={styles.headerButtons}>
            <button type="button" onClick={() => setShowForm((x) => !x)} className={styles.primary}>+ عميل جديد</button>
            <button type="button" onClick={() => router.push("/employee")}>الرئيسية</button>
          </div>
        </header>

        {error && <div className={styles.error} role="alert">{error}</div>}
        {created && <div className={styles.created}>
          <div><strong>تم تسجيل العميل: {created.name}</strong><p>{created.primaryAddress}</p></div>
          <button type="button" onClick={() => newDelivery(created)}>إنشاء طلب توصيل</button>
          <button type="button" onClick={() => setCreated(null)} aria-label="إغلاق الإشعار">×</button>
        </div>}

        {showForm && (
          <section className={styles.formPanel} aria-label="تسجيل عميل جديد">
            <div className={styles.formHeading}><h2>إضافة عميل</h2><button type="button" onClick={() => setShowForm(false)}>إغلاق</button></div>
            <div className={styles.formFields}>
              <label>الاسم الكامل<input value={name} onChange={(event) => setName(event.target.value)} placeholder="اسم العميل" maxLength={100} /></label>
              <label>رقم الهاتف<input dir="ltr" inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="07XXXXXXXX" /></label>
              <label className={styles.wide}>عنوان التوصيل<input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="المنطقة، الشارع، رقم المنزل..." maxLength={250}/></label>
            </div>
            <button type="button" disabled={saving} className={styles.primary} onClick={() => void saveCustomer()}>{saving ? "جاري الحفظ..." : "حفظ العميل"}</button>
          </section>
        )}

        <section className={styles.searchPanel}>
          <label htmlFor="customer-search">البحث بالاسم أو رقم الهاتف</label>
          <input id="customer-search" type="search" autoComplete="off" value={query} onChange={(event) => {
            const next = event.target.value;
            setQuery(next);
            if (next.trim().length < 2) {
              setResults([]);
              setSearching(false);
            }
          }} placeholder="اكتب حرفين أو رقمين على الأقل..." />

          {searching && <p className={styles.hint}>جاري البحث...</p>}
          {!searching && query.trim().length >= 2 && results.length === 0 && !error && (
            <div className={styles.empty}>ما لقينا عميل مطابق. بإمكانك إضافة عميل جديد.</div>
          )}
          {!searching && query.trim().length < 2 && (
            <div className={styles.empty}>ابدأ كتابة الاسم أو رقم الهاتف لعرض النتائج.</div>
          )}
          <div className={styles.results}>
            {results.map((customer) => (
              <article className={styles.card} key={customer.id}>
                <div className={styles.avatar}>{customer.name.trim().charAt(0) || "ع"}</div>
                <div className={styles.details}>
                  <strong>{customer.name}</strong>
                  <span>{customer.phone}</span>
                  <p>{customer.primaryAddress || "لا يوجد عنوان مسجّل"}</p>
                </div>
                <button type="button" onClick={() => newDelivery(customer)}>طلب توصيل ←</button>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
