//src/lib/native.ts

// JS bridge for native shell (Median.co / Despia / Capacitor wrapper).
// In a plain browser these are no-ops or graceful fallbacks.
// When wrapped in a native APK, the shell injects real implementations.

export type PermissionResult = "granted" | "denied" | "unavailable";

declare global {
  interface Window {
    // Photo library permission. Native shell shows the OS prompt and
    // resolves with "granted" or "denied".
    requestPhotoPermission?: () => Promise<PermissionResult> | PermissionResult;

    // Notification permission (POST_NOTIFICATIONS on Android 13+).
    requestNotificationPermission?: () => Promise<PermissionResult> | PermissionResult;

    // Schedules / shows a local notification immediately.
    sendPhotoReminderNotification?: (payload: {
      title: string;
      body: string;
      // Optional deep link the native shell should open on tap.
      deepLink?: string;
    }) => Promise<void> | void;

    // How many photos in the device gallery were created in the last `days`.
    // Returns -1 when unsupported (so we can fall back to in-app tracking).
    getRecentPhotoCount?: (days: number) => Promise<number> | number;

    // Open the OS-level app settings page (so a user who denied a
    // permission can re-enable it).
    openAppSettings?: () => void;

    // Whether we're running inside a known native shell.
    __MEMORI_NATIVE__?: boolean;
  }
}

export function isNativeShell(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window.__MEMORI_NATIVE__);
}

export async function requestPhotoPermission(): Promise<PermissionResult> {
  if (typeof window === "undefined") return "unavailable";
  if (typeof window.requestPhotoPermission === "function") {
    try {
      const r = await window.requestPhotoPermission();
      return r ?? "unavailable";
    } catch (e) {
      console.error("[native] requestPhotoPermission failed", e);
      return "denied";
    }
  }
  // Browser: the <input type="file"> picker handles its own permission UI,
  // so we treat the web as effectively granted.
  return "granted";
}

export async function requestNotificationPermission(): Promise<PermissionResult> {
  if (typeof window === "undefined") return "unavailable";
  if (typeof window.requestNotificationPermission === "function") {
    try {
      const r = await window.requestNotificationPermission();
      return r ?? "unavailable";
    } catch (e) {
      console.error("[native] requestNotificationPermission failed", e);
      return "denied";
    }
  }
  // Browser fallback: Web Notifications API.
  if (typeof Notification !== "undefined") {
    try {
      const p = await Notification.requestPermission();
      return p === "granted" ? "granted" : "denied";
    } catch {
      return "denied";
    }
  }
  return "unavailable";
}

export async function sendPhotoReminderNotification(opts: {
  title: string;
  body: string;
  deepLink?: string;
}): Promise<void> {
  if (typeof window === "undefined") return;
  if (typeof window.sendPhotoReminderNotification === "function") {
    try { await window.sendPhotoReminderNotification(opts); }
    catch (e) { console.error("[native] sendPhotoReminderNotification failed", e); }
    return;
  }
  // Browser fallback (works for testing in desktop browsers).
  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    try { new Notification(opts.title, { body: opts.body }); } catch { /* ignore */ }
  }
}

export async function getRecentPhotoCount(days: number): Promise<number> {
  if (typeof window === "undefined") return -1;
  if (typeof window.getRecentPhotoCount === "function") {
    try {
      const n = await window.getRecentPhotoCount(days);
      return typeof n === "number" ? n : -1;
    } catch (e) {
      console.error("[native] getRecentPhotoCount failed", e);
      return -1;
    }
  }
  return -1;
}

export function openAppSettings(): void {
  if (typeof window === "undefined") return;
  if (typeof window.openAppSettings === "function") {
    try { window.openAppSettings(); } catch (e) { console.error(e); }
  }
}
