import { get, set } from "idb-keyval";

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

const KEY = "memori_albums_v1";

export async function getAlbums(): Promise<Album[]> {
  return (await get<Album[]>(KEY)) ?? [];
}

export async function saveAlbum(album: Album) {
  const list = await getAlbums();
  list.unshift(album);
  await set(KEY, list);
}

export async function updateAlbum(id: string, patch: Partial<Album>) {
  const list = await getAlbums();
  const next = list.map(a => (a.id === id ? { ...a, ...patch } : a));
  await set(KEY, next);
}

export async function deleteAlbum(id: string) {
  const list = await getAlbums();
  await set(KEY, list.filter(a => a.id !== id));
}

export const FREE_LIMIT = 2;
