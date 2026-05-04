// Reminder logic: decide when to nudge the user to weave a new album,
// then ask the native shell (or browser) to actually show the notification.
import { supabase } from "@/integrations/supabase/client";
import { getRecentPhotoCount, sendPhotoReminderNotification } from "@/lib/native";
import { getTrackedPhotoCount } from "@/lib/photoActivity";

const RECENT_DAYS = 30;
const RECENT_PHOTO_THRESHOLD = 15;
const STALE_DAYS = 21; // 3 weeks
const MIN_GAP_DAYS = 7; // don't nudge more than once a week

const DAY = 24 * 60 * 60 * 1000;

type ProfileRow = {
  notifications_enabled: boolean;
  last_album_created_at: string | null;
  last_reminder_sent_at: string | null;
};

/**
 * Called on app start (and could be called by a periodic timer too).
 * Checks the user's recent activity and fires a local reminder when warranted.
 */
export async function maybeSendPhotoReminder(): Promise<{ sent: boolean; reason?: string }> {
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id;
  if (!uid) return { sent: false, reason: "not_signed_in" };

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("notifications_enabled,last_album_created_at,last_reminder_sent_at")
    .maybeSingle<ProfileRow>();

  if (error || !profile) return { sent: false, reason: "no_profile" };
  if (!profile.notifications_enabled) return { sent: false, reason: "disabled" };

  // Throttle: never more than once every MIN_GAP_DAYS.
  if (profile.last_reminder_sent_at) {
    const last = new Date(profile.last_reminder_sent_at).getTime();
    if (Date.now() - last < MIN_GAP_DAYS * DAY) {
      return { sent: false, reason: "throttled" };
    }
  }

  // Condition A: native bridge reports >= 15 photos in last 30 days.
  // Condition B: user picked >= 15 photos in-app in last 30 days (fallback).
  // Condition C: no album made in 21+ days.
  const nativeCount = await getRecentPhotoCount(RECENT_DAYS);
  const trackedCount = await getTrackedPhotoCount(RECENT_DAYS);
  const photoCount = nativeCount >= 0 ? nativeCount : trackedCount;
  const photoTrigger = photoCount >= RECENT_PHOTO_THRESHOLD;

  let staleTrigger = false;
  if (profile.last_album_created_at) {
    const last = new Date(profile.last_album_created_at).getTime();
    staleTrigger = Date.now() - last >= STALE_DAYS * DAY;
  }

  if (!photoTrigger && !staleTrigger) {
    return { sent: false, reason: "no_trigger" };
  }

  await sendPhotoReminderNotification({
    title: "사진이 많이 쌓였어요 ✨",
    body: "지금 '그때 그 장면'으로 정리해보세요.",
    deepLink: "/create",
  });

  // Mark last_reminder_sent_at so we don't spam.
  await supabase
    .from("profiles")
    .update({ last_reminder_sent_at: new Date().toISOString() })
    .eq("user_id", uid);

  return { sent: true };
}

/** Called whenever an album is successfully created. */
export async function recordAlbumCreated(): Promise<void> {
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id;
  if (!uid) return;
  await supabase
    .from("profiles")
    .update({ last_album_created_at: new Date().toISOString() })
    .eq("user_id", uid);
}
