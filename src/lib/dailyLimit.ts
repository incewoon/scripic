// Daily album-creation limit (1 album per local day, +1 extra by review reward).
// Client-side enforcement only.

const KEY = "moara_last_album_date";
const DEVICE_KEY = "moara_device_id";
const EXTRA_GRANTED_KEY = "moara_extra_album_granted_date";
const EXTRA_USED_KEY = "moara_extra_album_used_date";

export function todayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Local YYYY-MM-DD sent to server for timezone-aware daily limit. */
export function getLocalDate(): string {
  return new Date().toLocaleDateString("en-CA");
}

export function getLastAlbumDate(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(KEY);
}

export function hasExtraGrantedToday(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(EXTRA_GRANTED_KEY) === todayKey();
}

export function hasExtraUsedToday(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(EXTRA_USED_KEY) === todayKey();
}

export function grantExtraAlbumToday(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(EXTRA_GRANTED_KEY, todayKey());
}

export function canCreateAlbumToday(): boolean {
  const last = getLastAlbumDate();
  const today = todayKey();
  if (last !== today) return true;
  // Already used the base 1/day. Allow if extra granted and not yet used today.
  return hasExtraGrantedToday() && !hasExtraUsedToday();
}

export function markAlbumCreatedToday(): void {
  if (typeof localStorage === "undefined") return;
  const today = todayKey();
  const last = localStorage.getItem(KEY);
  if (last === today) {
    // Base slot already used → this counts as the extra album.
    if (hasExtraGrantedToday()) {
      localStorage.setItem(EXTRA_USED_KEY, today);
    }
  } else {
    localStorage.setItem(KEY, today);
  }
}

/** Stable per-install device id. */
export function getDeviceId(): string {
  if (typeof localStorage === "undefined") return "ssr";
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36));
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

/** Local YYYY-MM-DD for tomorrow — used in the "come back tomorrow" message. */
export function nextAvailableDateLabel(lang: "en" | "ko"): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString(lang === "ko" ? "ko-KR" : "en-US", {
    year: "numeric", month: "short", day: "numeric",
  });
}
