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
}

export const NotificationPermission =
  registerPlugin<NotificationPermissionPlugin>("NotificationPermission");

/** Request POST_NOTIFICATIONS at runtime (Android 13+). Web/older: true. */
export async function requestPostNotificationsPermission(): Promise<boolean> {
  try {
    const r = await NotificationPermission.request();
    return !!r?.granted;
  } catch {
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

export async function requestMediaPermission(): Promise<boolean> {
  try {
    const r = await NotificationPermission.requestMedia();
    return !!r?.granted;
  } catch {
    return false;
  }
}
