import JSZip from "jszip";
import { get, set } from "idb-keyval";
import { getAlbums, type Album, FREE_LIMIT } from "./storage";

const SCHEMA_VERSION = 1;
const APP_NAME = "memori";

type BackupOwner =
  | { kind: "user"; userId: string; email: string | null }
  | { kind: "guest"; userId: null; email: null };

type Manifest = {
  schemaVersion: number;
  app: string;
  createdAt: string;
  owner: BackupOwner;
  albumCount: number;
  albums: { id: string; title: string; photoCount: number }[];
};

function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; ext: string } {
  // e.g. data:image/jpeg;base64,XXXX
  const m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
  if (!m) {
    // Unknown shape; store as .bin
    return { bytes: new Uint8Array(), ext: "bin" };
  }
  const mime = m[1].toLowerCase();
  const b64 = m[2];
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  let ext = "jpg";
  if (mime.includes("png")) ext = "png";
  else if (mime.includes("webp")) ext = "webp";
  else if (mime.includes("gif")) ext = "gif";
  else if (mime.includes("jpeg") || mime.includes("jpg")) ext = "jpg";
  return { bytes, ext };
}

function bytesToDataUrl(bytes: Uint8Array, ext: string): string {
  let mime = "image/jpeg";
  if (ext === "png") mime = "image/png";
  else if (ext === "webp") mime = "image/webp";
  else if (ext === "gif") mime = "image/gif";
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return `data:${mime};base64,${btoa(bin)}`;
}

function pad(n: number, w = 3): string {
  return n.toString().padStart(w, "0");
}

function fileTimestamp(d = new Date()): string {
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1, 2);
  const dd = pad(d.getDate(), 2);
  const hh = pad(d.getHours(), 2);
  const mi = pad(d.getMinutes(), 2);
  return `${yyyy}${mm}${dd}-${hh}${mi}`;
}

export async function exportBackupZip(opts: {
  userId: string | null;
  email: string | null;
}): Promise<void> {
  const albums = await getAlbums();
  const zip = new JSZip();

  const owner: BackupOwner = opts.userId
    ? { kind: "user", userId: opts.userId, email: opts.email ?? null }
    : { kind: "guest", userId: null, email: null };

  const manifest: Manifest = {
    schemaVersion: SCHEMA_VERSION,
    app: APP_NAME,
    createdAt: new Date().toISOString(),
    owner,
    albumCount: albums.length,
    albums: albums.map((a) => ({
      id: a.id,
      title: a.title,
      photoCount: a.photos.length,
    })),
  };

  zip.file("manifest.json", JSON.stringify(manifest, null, 2));

  for (const album of albums) {
    const dir = `albums/${album.id}`;
    const albumJson = {
      id: album.id,
      title: album.title,
      subtitle: album.subtitle,
      intro: album.intro,
      closing: album.closing,
      period: album.period ?? null,
      location: album.location ?? null,
      createdAt: album.createdAt,
      photos: album.photos.map((p, i) => ({
        index: i + 1,
        caption: p.caption,
      })),
    };
    zip.file(`${dir}/album.json`, JSON.stringify(albumJson, null, 2));
    album.photos.forEach((p, i) => {
      const { bytes, ext } = dataUrlToBytes(p.dataUrl);
      zip.file(`${dir}/photos/${pad(i + 1)}.${ext}`, bytes);
    });
  }

  const blob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  const filename = `moara-backup-${fileTimestamp()}.zip`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export type ImportResult =
  | { ok: true; imported: number; skippedFreeLimit: number }
  | { ok: false; reason: "invalid" | "owner_mismatch" | "guest_only_mismatch" };

const GUEST_KEY = "memori_albums_v1";
const accountKey = (uid: string) => `memori_albums_v1__${uid}`;

function activeKey(currentUserId: string | null): string {
  return currentUserId ? accountKey(currentUserId) : GUEST_KEY;
}

export async function importBackupZip(
  file: File,
  currentUserId: string | null,
): Promise<ImportResult> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    return { ok: false, reason: "invalid" };
  }

  const manifestFile = zip.file("manifest.json");
  if (!manifestFile) return { ok: false, reason: "invalid" };

  let manifest: Manifest;
  try {
    manifest = JSON.parse(await manifestFile.async("string")) as Manifest;
  } catch {
    return { ok: false, reason: "invalid" };
  }

  if (
    !manifest ||
    manifest.app !== APP_NAME ||
    typeof manifest.schemaVersion !== "number" ||
    manifest.schemaVersion > SCHEMA_VERSION ||
    !manifest.owner
  ) {
    return { ok: false, reason: "invalid" };
  }

  // Strict owner matching
  if (manifest.owner.kind === "user") {
    if (!currentUserId || currentUserId !== manifest.owner.userId) {
      return { ok: false, reason: "owner_mismatch" };
    }
  } else if (manifest.owner.kind === "guest") {
    if (currentUserId) {
      return { ok: false, reason: "guest_only_mismatch" };
    }
  } else {
    return { ok: false, reason: "invalid" };
  }

  // Reconstruct albums
  const existing = (await get<Album[]>(activeKey(currentUserId))) ?? [];
  const existingIds = new Set(existing.map((a) => a.id));
  const isSubscribed = false; // owner-side enforcement is handled by the UI (we don't grant premium via import)
  const restored: Album[] = [];
  let skippedFreeLimit = 0;

  const remainingSlots = () =>
    isSubscribed
      ? Number.POSITIVE_INFINITY
      : Math.max(0, FREE_LIMIT - (existing.length + restored.length));

  for (const meta of manifest.albums) {
    if (remainingSlots() <= 0 && !currentUserId) {
      // Guest: enforce free limit. For logged-in users we don't enforce here
      // (subscription/credits are server-side concepts; we still import).
      skippedFreeLimit++;
      continue;
    }
    const dir = `albums/${meta.id}`;
    const albumJsonFile = zip.file(`${dir}/album.json`);
    if (!albumJsonFile) continue;
    let albumJson: any;
    try {
      albumJson = JSON.parse(await albumJsonFile.async("string"));
    } catch {
      continue;
    }

    // Load photos in order
    const photoFiles = Object.keys(zip.files)
      .filter((p) => p.startsWith(`${dir}/photos/`) && !zip.files[p].dir)
      .sort();

    const photos: Album["photos"] = [];
    for (let i = 0; i < photoFiles.length; i++) {
      const path = photoFiles[i];
      const ext = path.split(".").pop()?.toLowerCase() || "jpg";
      const bytes = await zip.file(path)!.async("uint8array");
      const dataUrl = bytesToDataUrl(bytes, ext);
      const caption =
        Array.isArray(albumJson.photos) && albumJson.photos[i]?.caption
          ? String(albumJson.photos[i].caption)
          : "";
      photos.push({ dataUrl, caption });
    }

    // Avoid id collisions
    let id = String(albumJson.id ?? meta.id);
    if (existingIds.has(id) || restored.some((r) => r.id === id)) {
      id = `${id}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    }

    restored.push({
      id,
      title: String(albumJson.title ?? ""),
      subtitle: String(albumJson.subtitle ?? ""),
      intro: String(albumJson.intro ?? ""),
      closing: String(albumJson.closing ?? ""),
      period: albumJson.period ?? undefined,
      location: albumJson.location ?? undefined,
      photos,
      createdAt: Number(albumJson.createdAt ?? Date.now()),
    });
  }

  if (restored.length === 0) {
    return { ok: true, imported: 0, skippedFreeLimit };
  }

  // Merge: newest first preserved by prepending restored items
  const merged = [...restored, ...existing];
  await set(activeKey(currentUserId), merged);

  const storage = await import("./storage");
  storage.notifyAlbums();

  return { ok: true, imported: restored.length, skippedFreeLimit };
}
