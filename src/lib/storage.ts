import { get, set } from "idb-keyval";

export type Album = {
  id: string;
  title: string;
  subtitle: string;
  intro: string;
  closing: string;
  period?: string;
  location?: string;
  lat?: number;
  lng?: number;
  tags?: string[];
  favorite?: boolean;
  photos: { dataUrl: string; caption: string }[];
  createdAt: number;
};

const KEY = "memori_albums_v1";

/** Ask the browser to mark our IndexedDB as persistent so it isn't auto-evicted.
 *  Safe to call repeatedly. Resolves with the resulting persistence state. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (typeof navigator === "undefined" || !navigator.storage) return false;
    if (await navigator.storage.persisted?.()) return true;
    if (typeof navigator.storage.persist === "function") {
      return await navigator.storage.persist();
    }
    return false;
  } catch {
    return false;
  }
}

/** Snapshot of the browser's storage state — used by the Settings diagnostics panel. */
export async function getStorageDiagnostics(): Promise<{
  origin: string;
  persisted: boolean;
  usage: number;
  quota: number;
}> {
  const origin = typeof location !== "undefined" ? location.origin : "";
  let persisted = false;
  let usage = 0;
  let quota = 0;
  try {
    if (typeof navigator !== "undefined" && navigator.storage) {
      persisted = (await navigator.storage.persisted?.()) ?? false;
      const est = await navigator.storage.estimate?.();
      usage = est?.usage ?? 0;
      quota = est?.quota ?? 0;
    }
  } catch { /* ignore */ }
  return { origin, persisted, usage, quota };
}

const listeners = new Set<() => void>();
export function subscribeAlbums(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
function notify() {
  listeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
}
export function notifyAlbums() { notify(); }

export async function getAlbums(): Promise<Album[]> {
  return (await get<Album[]>(KEY)) ?? [];
}

export async function saveAlbum(album: Album) {
  const list = await getAlbums();
  list.unshift(album);
  await set(KEY, list);
  notify();
}

export async function updateAlbum(id: string, patch: Partial<Album>) {
  const list = await getAlbums();
  const next = list.map((a) => (a.id === id ? { ...a, ...patch } : a));
  await set(KEY, next);
  notify();
}

export async function deleteAlbum(id: string) {
  const list = await getAlbums();
  await set(KEY, list.filter((a) => a.id !== id));
  notify();
}
