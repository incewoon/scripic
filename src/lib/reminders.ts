// Reminder logic: decide when to nudge the user to weave a new album,
// then ask the native shell (or browser) to actually show the notification.
//
// Storage: this app uses anonymous Firebase Auth and keeps user state on
// the device. Reminder bookkeeping (enabled flag, last-album timestamp,
// last-reminder timestamp) lives in localStorage.

import { getRecentPhotoCount, sendPhotoReminderNotification } from "@/lib/native";
import { getTrackedPhotoCount } from "@/lib/photoActivity";

const RECENT_DAYS = 30;
const RECENT_PHOTO_THRESHOLD = 15;
const STALE_DAYS = 21; // 3 weeks
const MIN_GAP_DAYS = 7; // don't nudge more than once a week
const DAY = 24 * 60 * 60 * 1000;

const ENABLED_KEY = "moara_notifications_enabled";
const LAST_ALBUM_KEY = "moara_last_album_created_at";
const LAST_REMINDER_KEY = "moara_last_reminder_sent_at";

function readNum(key: string): number | null {
  if (typeof localStorage === "undefined") return null;
  const v = localStorage.getItem(key);
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function setNotificationsEnabled(enabled: boolean): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(ENABLED_KEY, enabled ? "1" : "0");
}

export function getNotificationsEnabled(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(ENABLED_KEY) === "1";
}

export async function maybeSendPhotoReminder(): Promise<{ sent: boolean; reason?: string }> {
  if (!getNotificationsEnabled()) return { sent: false, reason: "disabled" };

  const lastReminder = readNum(LAST_REMINDER_KEY);
  if (lastReminder && Date.now() - lastReminder < MIN_GAP_DAYS * DAY) {
    return { sent: false, reason: "throttled" };
  }

  const nativeCount = await getRecentPhotoCount(RECENT_DAYS);
  const trackedCount = await getTrackedPhotoCount(RECENT_DAYS);
  const photoCount = nativeCount >= 0 ? nativeCount : trackedCount;
  const photoTrigger = photoCount >= RECENT_PHOTO_THRESHOLD;

  const lastAlbum = readNum(LAST_ALBUM_KEY);
  const staleTrigger = lastAlbum ? Date.now() - lastAlbum >= STALE_DAYS * DAY : false;

  if (!photoTrigger && !staleTrigger) {
    return { sent: false, reason: "no_trigger" };
  }

  await sendPhotoReminderNotification({
    title: "사진이 많이 쌓였어요 ✨",
    body: "지금 '그때 그 장면'으로 정리해보세요.",
    deepLink: "/create",
  });

  if (typeof localStorage !== "undefined") {
    localStorage.setItem(LAST_REMINDER_KEY, String(Date.now()));
  }
  return { sent: true };
}

/** Called whenever an album is successfully created. */
export async function recordAlbumCreated(): Promise<void> {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(LAST_ALBUM_KEY, String(Date.now()));
}
