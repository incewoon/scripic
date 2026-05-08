// Daily album-creation limit (1 album per local day).
// Client-side enforcement only; will be backed by the Firebase proxy later.

const KEY = "moara_last_album_date";
const DEVICE_KEY = "moara_device_id";

function todayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function getLastAlbumDate(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(KEY);
}

export function canCreateAlbumToday(): boolean {
  const last = getLastAlbumDate();
  return last !== todayKey();
}

export function markAlbumCreatedToday(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(KEY, todayKey());
}

/** Stable per-install device id, used later by the Firebase proxy for limits. */
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
