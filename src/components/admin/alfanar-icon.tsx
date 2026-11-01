import type { ReactNode, SVGProps } from "react";

type Name = "book" | "ticket" | "truck" | "clock" | "plus" | "info" | "shield" | "calendar" | "activity" | "chevron-down" | "chevron-up" | "x" | "search" | "refresh" | "user" | "coins" | "package" | "check" | "filter";

export function AlfanarIcon({ name, size = 18, ...props }: SVGProps<SVGSVGElement> & { name: Name; size?: number }) {
  const paths: Record<Name, ReactNode> = {
    book: <><path d="M12 7v14"/><path d="M3 18.5V4.6c3-.6 6-.2 9 1.8 3-2 6-2.4 9-1.8v13.9c-3-.6-6-.2-9 1.8-3-2-6-2.4-9-1.8Z"/></>,
    ticket: <><path d="M4 6h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4V6Z"/><path d="M12 6v12" strokeDasharray="2 2"/></>,
    truck: <><path d="M3 6h11v11H3zM14 10h4l3 4v3h-7"/><circle cx="7.5" cy="18" r="2"/><circle cx="17.5" cy="18" r="2"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    plus: <path d="M12 4v16M4 12h16"/>, info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></>,
    shield: <><path d="M12 2 20 5v6c0 5-4 8.5-8 11-4-2.5-8-6-8-11V5Z"/><path d="m9 12 2 2 4-4"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/></>,
    activity: <><path d="m3 13 5-5 4 4 4-6 5 5"/><path d="M3 20h18"/></>,
    "chevron-down": <path d="m6 9 6 6 6-6"/>, "chevron-up": <path d="m6 15 6-6 6 6"/>,
    x: <path d="M5 5 19 19M19 5 5 19"/>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></>,
    refresh: <><path d="M20 7V3l-4 4h4a8 8 0 0 0-14-1M4 17v4l4-4H4a8 8 0 0 0 14 1"/></>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M4 21c0-5 3-7 8-7s8 2 8 7"/></>,
    coins: <><ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 4 16 4 16 0V6M4 12v6c0 4 16 4 16 0v-6"/></>,
    package: <><path d="m12 2 9 5-9 5-9-5 9-5ZM3 7v10l9 5 9-5V7M12 12v10"/></>,
    check: <path d="m5 12 5 5 9-10"/>, filter: <path d="M3 5h18l-7 8v6l-4 2v-8L3 5Z"/>,
  };
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>{paths[name]}</svg>;
}
