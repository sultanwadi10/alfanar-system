import {
  StoreDeviceControl,
  type StoreDeviceSummary,
} from "./store-device-control";
import {
  StoreRuntimeControl,
} from "./store-runtime-control";

import {
  listStoreDevices,
} from "@/lib/store/store-device-repository";
import {
  getStoreRuntimeState,
} from "@/lib/store/store-runtime-repository";

import styles from "./settings.module.css";

export const dynamic =
  "force-dynamic";

export default async function SettingsPage() {
  const [
    runtime,
    devices,
  ] =
    await Promise.all([
      getStoreRuntimeState(),
      listStoreDevices(),
    ]);

  const initialDevices:
    StoreDeviceSummary[] =
    devices.map(
      (device) => ({
        id:
          device.id,

        name:
          device.name,

        createdAt:
          device.createdAt.toISOString(),

        lastSeenAt:
          device.lastSeenAt.toISOString(),

        revokedAt:
          device.revokedAt
            ?.toISOString() ??
          null,
      }),
    );

  return (
    <section
      className={
        styles.page
      }
      dir="rtl"
    >
      <div
        className={
          styles.pageHeader
        }
      >
        <span>
          إعدادات النظام
        </span>

        <h1>
          التحكم والأمان
        </h1>

        <p>
          تشغيل نظام المحل، إيقافه، وإدارة الأجهزة المصرح لها بالوصول.
        </p>
      </div>

      <div
        className={
          styles.settingsStack
        }
      >
        <StoreRuntimeControl
          initialState={{
            status:
              runtime.status,

            updatedAt:
              runtime.updatedAt
                ?.toISOString() ??
              null,
          }}
        />

        <StoreDeviceControl
          initialDevices={
            initialDevices
          }
        />
      </div>
    </section>
  );
}
