import { normalizeJordanPhone } from "@/lib/customers/customer-phone";
import styles from "./customer-contact-actions.module.css";

export function CustomerContactActions({ phone, customerName }: { phone: string; customerName: string }) {
  const normalized = normalizeJordanPhone(phone.replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 1632)));
  const local = normalized ? `0${normalized.slice(4)}` : phone;
  return <div className={styles.actions}>
    <a className={styles.call} href={`tel:${normalized ?? phone}`} aria-label={`الاتصال بالزبون ${customerName}`}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" focusable="false"><path d="m8 3 3 5-2 2c1.4 2.7 2.3 3.6 5 5l2-2 5 3c0 3-2 5-4 5C10 21 3 14 3 7c0-2 2-4 5-4Z" strokeLinejoin="round"/></svg>
      <span>اتصال: <bdi dir="ltr">{local}</bdi></span>
    </a>
    {normalized && <a className={styles.whatsapp} href={`https://wa.me/${normalized.slice(1)}`} target="_blank" rel="noopener noreferrer" aria-label={`فتح محادثة واتساب مع ${customerName}`}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true" focusable="false"><path d="M20.5 11.8a8.5 8.5 0 0 1-12.7 7.4L3 20.5l1.3-4.7A8.5 8.5 0 1 1 20.5 11.8Z" strokeLinejoin="round"/><path d="m8.2 7.2 1.6 2.6-1 1.1c.9 1.7 1.6 2.4 3.3 3.3l1.1-1 2.6 1.6c-.2 1.5-1.2 2.1-2.3 1.9-3.4-.7-6.1-3.4-6.8-6.8-.2-1.1.4-2.1 1.5-2.7Z" strokeLinejoin="round"/></svg>
      <span>واتساب</span>
    </a>}
  </div>;
}
