"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { LogoutButton } from "@/components/auth/logout-button";

import styles from "./admin-shell.module.css";

type NavigationItem = {
  href: string;
  label: string;
};

type NavigationGroup = {
  title: string;
  items: NavigationItem[];
};

const navigationGroups: NavigationGroup[] = [
  {
    title: "الرئيسية",
    items: [
      {
        href: "/admin",
        label: "لوحة التحكم",
      },
    ],
  },
  {
    title: "التشغيل",
    items: [
      {
        href: "/admin/orders",
        label: "الطلبات",
      },
      {
        href: "/admin/customers",
        label: "العملاء",
      },
      {
        href: "/admin/coupons",
        label: "الكوبونات",
      },
      {
        href: "/admin/maps",
        label: "الخرائط",
      },
    ],
  },
  {
    title: "المخزون والأسعار",
    items: [
      {
        href: "/admin/inventory",
        label: "المخزون",
      },
      {
        href: "/admin/cooler",
        label: "الثلاجة",
      },
      {
        href: "/admin/operational-materials",
        label: "المواد التشغيلية",
      },
      {
        href: "/admin/pricing",
        label: "الأسعار",
      },
    ],
  },
  {
    title: "الإدارة",
    items: [
      {
        href: "/admin/employees",
        label: "الموظفون",
      },
      {
        href: "/admin/invoices",
        label: "الفواتير",
      },
      {
        href: "/admin/reports",
        label: "التقارير",
      },
    ],
  },
  {
    title: "النظام",
    items: [
      {
        href: "/admin/settings",
        label: "الإعدادات",
      },
    ],
  },
];

type AdminShellProps = {
  children: React.ReactNode;
};

type ThemeMode = "light" | "dark";

export function AdminShell({
  children,
}: AdminShellProps) {
  const pathname = usePathname();

  const [sidebarOpen, setSidebarOpen] =
    useState(false);

  const [
    notificationsOpen,
    setNotificationsOpen,
  ] = useState(false);

  const notificationCount = 0;

  useEffect(() => {
    const savedTheme =
      window.localStorage.getItem(
        "alfanar-theme",
      );

    const theme: ThemeMode =
      savedTheme === "dark"
        ? "dark"
        : "light";

    document.documentElement.dataset.theme =
      theme;
  }, []);

  function handleThemeToggle() {
    const currentTheme =
      document.documentElement.dataset.theme;

    const nextTheme: ThemeMode =
      currentTheme === "dark"
        ? "light"
        : "dark";

    document.documentElement.dataset.theme =
      nextTheme;

    window.localStorage.setItem(
      "alfanar-theme",
      nextTheme,
    );
  }

  function isNavigationItemActive(
    href: string,
  ) {
    if (href === "/admin") {
      return pathname === "/admin";
    }

    return pathname.startsWith(href);
  }

  return (
    <div
      className={styles.shell}
      dir="rtl"
    >
      <aside
        className={`${styles.sidebar} ${
          sidebarOpen
            ? styles.sidebarOpen
            : ""
        }`}
      >
        <div className={styles.brand}>
          <div
            className={styles.brandMark}
          >
            A
          </div>

          <div>
            <strong>
              نظام محطة الفنار
            </strong>

            <span>
              لوحة الإدارة
            </span>
          </div>
        </div>

        <nav
          className={styles.navigation}
        >
          {navigationGroups.map(
            (group) => (
              <div
                key={group.title}
                className={
                  styles.navigationGroup
                }
              >
                <span
                  className={
                    styles.groupTitle
                  }
                >
                  {group.title}
                </span>

                <div
                  className={
                    styles.groupLinks
                  }
                >
                  {group.items.map(
                    (item) => {
                      const isActive =
                        isNavigationItemActive(
                          item.href,
                        );

                      return (
                        <Link
                          key={
                            item.href
                          }
                          href={
                            item.href
                          }
                          className={
                            isActive
                              ? styles.activeLink
                              : styles.navLink
                          }
                          onClick={() =>
                            setSidebarOpen(
                              false,
                            )
                          }
                        >
                          {
                            item.label
                          }
                        </Link>
                      );
                    },
                  )}
                </div>
              </div>
            ),
          )}
        </nav>

        <div
          className={
            styles.sidebarFooter
          }
        >
          <span>
            Powered by
          </span>

          <strong>
            GLE TECHNOLOGY
          </strong>
        </div>
      </aside>

      {sidebarOpen && (
        <button
          type="button"
          className={styles.overlay}
          aria-label="إغلاق القائمة"
          onClick={() =>
            setSidebarOpen(false)
          }
        />
      )}

      <div
        className={
          styles.contentArea
        }
      >
        <header
          className={styles.header}
        >
          <div
            className={
              styles.headerStart
            }
          >
            <button
              type="button"
              className={
                styles.menuButton
              }
              onClick={() =>
                setSidebarOpen(
                  (current) =>
                    !current,
                )
              }
              aria-label="فتح القائمة"
            >
              ☰
            </button>

            <div>
              <strong>
                محطة الفنار
              </strong>

              <span>
                نظام الإدارة
              </span>
            </div>
          </div>

          <div
            className={
              styles.headerActions
            }
          >
            <div
              className={
                styles.notificationWrapper
              }
            >
              <button
                type="button"
                className={
                  styles.iconButton
                }
                aria-label="الإشعارات"
                onClick={() =>
                  setNotificationsOpen(
                    (current) =>
                      !current,
                  )
                }
              >
                🔔

                {notificationCount >
                  0 && (
                  <span
                    className={
                      styles.notificationBadge
                    }
                  >
                    {
                      notificationCount
                    }
                  </span>
                )}
              </button>

              {notificationsOpen && (
                <div
                  className={
                    styles.notificationsPanel
                  }
                >
                  <strong>
                    الإشعارات
                  </strong>

                  <p>
                    لا توجد إشعارات
                    جديدة.
                  </p>
                </div>
              )}
            </div>

            <button
              type="button"
              className={
                styles.iconButton
              }
              aria-label="تبديل مظهر النظام"
              title="تبديل الوضع الفاتح والداكن"
              onClick={
                handleThemeToggle
              }
            >
              ◐
            </button>

            <LogoutButton target="admin" />
          </div>
        </header>

        <main
          className={
            styles.mainContent
          }
        >
          {children}
        </main>
      </div>
    </div>
  );
}