// src/plugins/notification-permission.ts

// Custom Capacitor plugin wrapper for POST_NOTIFICATIONS permission,
// native SharedPreferences sync of the reminders_enabled flag, and
// polling-based deep link handoff from a notification tap.
import { registerPlugin } from "@capacitor/core";

export interface NotificationPermissionPlugin {
  request(): Promise<{ granted: boolean }>;
  setRemindersEnabled(opts: { enabled: boolean }): Promise<void>;
  getPendingDeepLink(): Promise<{ path: string | null }>;
  requestMedia(): Promise<{ granted: boolean }>;
  openNotificationSettings(): Promise<void>;
  openAppSettings(): Promise<void>;
  checkMediaPermission(): Promise<{ granted: boolean }>;
  openMediaPermissionSettings(): Promise<void>;
}

export const NotificationPermission =
  registerPlugin<NotificationPermissionPlugin>("NotificationPermission");

/** Request POST_NOTIFICATIONS at runtime (Android 13+). Web/older: true. */
export async function requestPostNotificationsPermission(): Promise<boolean> {
  try {
    const r = await withTimeout(
      NotificationPermission.request(),
      8000,
      { granted: false }
    );
    return !!r?.granted;
  } catch (e) {
    console.error("[notif-permission] request() failed", e);
    return false;
  }
}

/** Mirror the JS-side toggle into native SharedPreferences so the background
 *  Worker knows whether to run. No-op on the web. */
export async function setNativeRemindersEnabled(enabled: boolean): Promise<void> {
  try {
    await NotificationPermission.setRemindersEnabled({ enabled });
  } catch {
    /* web / plugin missing */
  }
}

/** One-shot poll for a pending deep link left by a notification tap.
 *  Returns null on web, or when nothing is pending. */
export async function getPendingDeepLink(): Promise<string | null> {
  try {
    const { path } = await NotificationPermission.getPendingDeepLink();
    return path ?? null;
  } catch {
    return null;
  }
}

// 안전장치: 네이티브 호출이 멈추면 8초 후 강제로 실패 처리
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export async function requestMediaPermission(): Promise<boolean> {
  try {
    const r = await withTimeout(
      NotificationPermission.requestMedia(), 
      8000, 
      { granted: false }
    );
    return !!r?.granted;
  } catch {
    return false;
  }
}

export async function openNotificationSettings(): Promise<void> {
  try {
    await NotificationPermission.openNotificationSettings();
  } catch {}
}

export async function openAppSettings(): Promise<void> {
  try {
    await NotificationPermission.openAppSettings();
  } catch {}
}

export async function checkMediaPermission(): Promise<boolean> {
  try {
    const r = await NotificationPermission.checkMediaPermission();
    return !!r?.granted;
  } catch {
    return false;
  }
}

export async function openMediaPermissionSettings(): Promise<void> {
  try {
    await NotificationPermission.openMediaPermissionSettings();
  } catch {}
}
