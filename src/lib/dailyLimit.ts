// src/lib/dailyLimit.ts

// Daily album-creation limit (1 album per local day, +1 extra by review reward).
// Client-side enforcement only.

import { httpsCallable } from "firebase/functions";
import { getFns } from "@/integrations/firebase/client";

const KEY = "moara_last_album_date";
const DEVICE_KEY = "moara_device_id";
const EXTRA_GRANTED_KEY = "moara_extra_album_granted_date";
const EXTRA_USED_KEY = "moara_extra_album_used_date";
// 서버 dailyStatus 캐시 (한도의 진실은 서버)
const CACHE_DATE_KEY = "moara_daily_cache_date";
const CACHE_USED_KEY = "moara_daily_used";
const CACHE_LIMIT_KEY = "moara_daily_limit";

type DailyCache = { used: number; limit: number };

function readDailyCache(): DailyCache | null {
  if (typeof localStorage === "undefined") return null;
  if (localStorage.getItem(CACHE_DATE_KEY) !== todayKey()) return null;
  const used = Number(localStorage.getItem(CACHE_USED_KEY));
  const limit = Number(localStorage.getItem(CACHE_LIMIT_KEY));
  if (!Number.isFinite(used) || !Number.isFinite(limit) || limit <= 0) return null;
  return { used, limit };
}

function writeDailyCache(used: number, limit: number): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(CACHE_DATE_KEY, todayKey());
  localStorage.setItem(CACHE_USED_KEY, String(used));
  localStorage.setItem(CACHE_LIMIT_KEY, String(limit));
}

function clearDailyCache(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(CACHE_DATE_KEY);
  localStorage.removeItem(CACHE_USED_KEY);
  localStorage.removeItem(CACHE_LIMIT_KEY);
}


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

// 이스터에그 통과 시 클라이언트의 당일 앨범 생성 제한 및 보상 기록을 초기화합니다.
 
export function resetDailyAlbumToday(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(KEY);
  localStorage.removeItem(EXTRA_GRANTED_KEY);
  localStorage.removeItem(EXTRA_USED_KEY);
}

/** 서버 기준으로 오늘 앨범을 더 만들 수 있는지 확인. 실패 시 local 값으로 폴백 */
export async function canCreateAlbumTodayServer(): Promise<boolean> {
  try {
    const call = httpsCallable(getFns(), "dailyStatus");
    const res = await call({
      localDate: getLocalDate(),
      deviceId: getDeviceId(),
    });
    const data = res.data as { used?: number; limit?: number };
    const used = data?.used ?? 0;
    const limit = data?.limit ?? 1;
    // 서버 limit이 이미 bonus를 포함한 값 → 그대로 사용
    return used < limit;
  } catch {
    return canCreateAlbumToday();
  }
}

/**
 * 서버 dailyStatus를 기준으로 localStorage를 맞춘다.
 * 로컬은 서버의 거울일 뿐, 여기서 한도를 "판단"하지 않는다.
 * @returns 오늘 앨범을 더 만들 수 있으면 true
 */
export async function syncDailyLimitFromServer(): Promise<boolean> {
  try {
    const call = httpsCallable(getFns(), "dailyStatus");
    const res = await call({
      localDate: getLocalDate(),
      deviceId: getDeviceId(),
    });
    const data = res.data as {
      used?: number;
      limit?: number;
      bonusGranted?: boolean;
    };

    if (typeof localStorage === "undefined") {
      return true;
    }

    const today = todayKey();
    const used = data?.used ?? 0;
    const limit = data?.limit ?? 1;
    const bonusGranted = data?.bonusGranted === true;

    // 사용 횟수 → KEY
    if (used >= 1) localStorage.setItem(KEY, today);
    else localStorage.removeItem(KEY);

    // 보너스 → EXTRA_*
    if (bonusGranted) {
      localStorage.setItem(EXTRA_GRANTED_KEY, today);
      if (used >= 2) localStorage.setItem(EXTRA_USED_KEY, today);
      else localStorage.removeItem(EXTRA_USED_KEY);
    } else {
      localStorage.removeItem(EXTRA_GRANTED_KEY);
      localStorage.removeItem(EXTRA_USED_KEY);
    }

    return used < limit;
  } catch {
    // 오프라인 등: 기존 로컬 캐시로 폴백
    return canCreateAlbumToday();
  }
}
