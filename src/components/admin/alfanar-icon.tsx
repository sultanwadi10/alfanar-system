import type { ReactNode, SVGProps } from "react";

export type AlfanarIconName = "book" | "ticket" | "truck" | "clock" | "plus" | "info" | "shield" | "calendar" | "activity" | "chevron-down" | "chevron-up" | "x" | "search" | "refresh" | "user" | "coins" | "package" | "check" | "filter" | "grid" | "store" | "cart" | "users" | "tag" | "snowflake" | "bars" | "settings" | "file" | "sun" | "moon" | "bell" | "logout" | "menu" | "arrow-left" | "card";

export function AlfanarIcon({ name, size = 18, ...props }: SVGProps<SVGSVGElement> & { name: AlfanarIconName; size?: number }) {
  const paths: Record<AlfanarIconName, ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
    store: <><path d="M3 10h18l-2-6H5l-2 6ZM5 13v8h14v-8M9 21v-7h6v7M3 10c0 4 4 4 4 0 0 4 5 4 5 0 0 4 5 4 5 0 0 4 4 4 4 0"/></>,
    cart: <><path d="M2 4h3l3 12h11l3-9H6"/><circle cx="10" cy="21" r="1"/><circle cx="18" cy="21" r="1"/></>,
    users: <><circle cx="9" cy="7" r="3"/><path d="M2 21v-3c0-5 14-5 14 0v3ZM17 4c5 0 5 6 0 6M19 14c4 0 4 4 4 7"/></>,
    tag: <><path d="m3 4 8-1 10 10-8 8L3 11V4Z"/><circle cx="7.5" cy="7.5" r="1"/></>,
    snowflake: <><path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9 4l3 3 3-3M9 20l3-3 3 3M3 11l4-1-1-4M21 13l-4 1 1 4M6 18l1-4-4-1M18 6l-1 4 4 1"/></>,
    bars: <><path d="M3 21h19"/><rect x="5" y="12" width="3" height="6" rx=".5"/><rect x="11" y="7" width="3" height="11" rx=".5"/><rect x="17" y="3" width="3" height="15" rx=".5"/></>,
    settings: <><path d="m10 3 4 0 1 3 3 1 3 3v4l-3 1-1 3-3 3h-4l-1-3-3-1-3-3v-4l3-1 1-3 3-3Z"/><circle cx="12" cy="12" r="3"/></>,
    file: <><path d="M5 2h9l5 5v15H5V2ZM14 2v6h5M8 12h8M8 16h8"/></>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 1v2M12 21v2M1 12h2M21 12h2M4 4l2 2M18 18l2 2M4 20l2-2M18 6l2-2"/></>,
    moon: <path d="M21 14A9 9 0 0 1 10 3a9 9 0 1 0 11 11Z"/>,
    bell: <><path d="M6 9a6 6 0 0 1 12 0v6l2 3H4l2-3V9ZM9 21h6"/></>,
    logout: <><path d="M13 4H4v16h9M10 12h12m-4-4 4 4-4 4"/></>,
    menu: <path d="M3 5h18M3 12h18M3 19h18"/>,
    "arrow-left": <path d="M20 12H4m6-6-6 6 6 6"/>,
    card: <><rect x="2" y="5" width="20" height="14" rx="3"/><path d="M2 10h20M6 15h4"/></>,
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
