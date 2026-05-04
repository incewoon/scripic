import { get, set, del } from "idb-keyval";

export type Album = {
  id: string;
  title: string;
  subtitle: string;
  intro: string;
  closing: string;
  period?: string;
  location?: string;
  photos: { dataUrl: string; caption: string }[];
  createdAt: number;
};

const GUEST_KEY = "memori_albums_v1";
const accountKey = (uid: string) => `memori_albums_v1__${uid}`;

let currentUserId: string | null = null;
const migrationDone = new Set<string>();

// Subscribers re-fetch when the active storage scope changes
// (login / logout / account switch) or when albums are mutated.
const listeners = new Set<() => void>();
export function subscribeAlbums(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
function notify() {
  listeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
}

function activeKey(): string {
  return currentUserId ? accountKey(currentUserId) : GUEST_KEY;
}

/**
 * Bind album storage to a user (or null = guest).
 * On the first sign-in for a given account, if that account has no albums
 * stored yet but guest-mode albums exist, migrate them across once and
 * clear the guest bucket.
 */
export async function setStorageUserId(uid: string | null): Promise<void> {
  if (uid === currentUserId) return;
  currentUserId = uid;

  if (uid && !migrationDone.has(uid)) {
    migrationDone.add(uid);
    try {
      const accountList = (await get<Album[]>(accountKey(uid))) ?? [];
      const guestList = (await get<Album[]>(GUEST_KEY)) ?? [];
      if (accountList.length === 0 && guestList.length > 0) {
        await set(accountKey(uid), guestList);
        await del(GUEST_KEY);
      }
    } catch (e) {
      console.error("[storage] guest migration failed", e);
    }
  }

  notify();
}

export async function getAlbums(): Promise<Album[]> {
  return (await get<Album[]>(activeKey())) ?? [];
}

export async function saveAlbum(album: Album) {
  const list = await getAlbums();
  list.unshift(album);
  await set(activeKey(), list);
  notify();
}

export async function updateAlbum(id: string, patch: Partial<Album>) {
  const list = await getAlbums();
  const next = list.map((a) => (a.id === id ? { ...a, ...patch } : a));
  await set(activeKey(), next);
  notify();
}

export async function deleteAlbum(id: string) {
  const list = await getAlbums();
  await set(activeKey(), list.filter((a) => a.id !== id));
  notify();
}

export const FREE_LIMIT = 5;
