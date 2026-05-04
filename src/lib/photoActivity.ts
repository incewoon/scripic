// In-app fallback tracker for "how many photos has the user looked at lately".
// Used when the native bridge can't tell us (web, or older native shells).
import { get, set } from "idb-keyval";

const KEY = "memori_photo_picks_v1";
type Entry = { ts: number; count: number };

async function readAll(): Promise<Entry[]> {
  return (await get<Entry[]>(KEY)) ?? [];
}

/** Record that the user just picked `n` photos. */
export async function recordPhotoPick(n: number): Promise<void> {
  if (n <= 0) return;
  const list = await readAll();
  list.push({ ts: Date.now(), count: n });
  // Keep only the last 90 days to bound storage.
  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
  await set(KEY, list.filter((e) => e.ts >= cutoff));
}

/** How many photos the user picked within the last `days`. */
export async function getTrackedPhotoCount(days: number): Promise<number> {
  const list = await readAll();
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return list.reduce((acc, e) => (e.ts >= cutoff ? acc + e.count : acc), 0);
}
