// src/lib/backup.ts
// Encrypted album backup. AES-GCM with a PBKDF2-derived key from a 4-digit PIN.
// File is a small outer ZIP containing meta.json + payload.enc.
// Inner payload is the original album-bundle ZIP (manifest + photos).

import JSZip from "jszip";
import { getAlbums, type Album } from "./storage";
import { set, get } from "idb-keyval";
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';


const SCHEMA_VERSION = 2;
const APP_NAME = "scripic";
const LEGACY_APP_NAMES = ["memoryweaver", "moara"];
const PBKDF2_ITER = 200_000;

const KEY = "memori_albums_v1";

// ---------- helpers ----------

function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; ext: string } {
  const m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
  if (!m) return { bytes: new Uint8Array(), ext: "bin" };
  const mime = m[1].toLowerCase();
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  let ext = "jpg";
  if (mime.includes("png")) ext = "png";
  else if (mime.includes("webp")) ext = "webp";
  else if (mime.includes("gif")) ext = "gif";
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
  return `${d.getFullYear()}${pad(d.getMonth() + 1, 2)}${pad(d.getDate(), 2)}-${pad(d.getHours(), 2)}${pad(d.getMinutes(), 2)}`;
}

function b64encode(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder().encode(pin);
  const baseKey = await crypto.subtle.importKey("raw", enc.buffer.slice(0) as ArrayBuffer, "PBKDF2", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt.buffer.slice(0) as ArrayBuffer, iterations: PBKDF2_ITER, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = (reader.result as string).split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ---------- export ----------

export async function exportBackupZip(pin: string): Promise<{ uri?: string }> {
  if (!/^\d{4}$/.test(pin)) throw new Error("invalid_pin");

  const albums = await getAlbums();

  // Inner zip: original payload structure (manifest + per-album json + photos).
  const inner = new JSZip();
  const manifest = {
    schemaVersion: SCHEMA_VERSION,
    app: APP_NAME,
    createdAt: new Date().toISOString(),
    albumCount: albums.length,
    albums: albums.map((a) => ({ id: a.id, title: a.title, photoCount: a.photos.length })),
  };
  inner.file("manifest.json", JSON.stringify(manifest, null, 2));
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
      lat: typeof album.lat === "number" ? album.lat : null,
      lng: typeof album.lng === "number" ? album.lng : null,
      tags: Array.isArray(album.tags) ? album.tags : [],
      favorite: !!album.favorite,
      createdAt: album.createdAt,
      photos: album.photos.map((p, i) => ({ index: i + 1, caption: p.caption })),
    };
    inner.file(`${dir}/album.json`, JSON.stringify(albumJson, null, 2));
    album.photos.forEach((p, i) => {
      const { bytes, ext } = dataUrlToBytes(p.dataUrl);
      inner.file(`${dir}/photos/${pad(i + 1)}.${ext}`, bytes);
    });
  }
  const innerBytes = await inner.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  // Encrypt inner payload.
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pin, salt);
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv.buffer.slice(0) as ArrayBuffer },
      key,
      innerBytes.buffer.slice(0) as ArrayBuffer,
    ),
  );

  // Outer zip: meta.json + payload.enc.
  const outer = new JSZip();
  outer.file(
    "meta.json",
    JSON.stringify(
      {
        app: APP_NAME,
        v: SCHEMA_VERSION,
        kdf: "PBKDF2-SHA256",
        iter: PBKDF2_ITER,
        salt: b64encode(salt),
        iv: b64encode(iv),
      },
      null,
      2,
    ),
  );
  outer.file("payload.enc", cipher);

  const blob = await outer.generateAsync({
    type: "blob",
    mimeType: "application/octet-stream",
  });
  const filename = `scripic-backup-${fileTimestamp()}.bak`;

  if (Capacitor.isNativePlatform()) {
    await Filesystem.writeFile({
      path: filename,
      data: base64Data,
      directory: Directory.Documents,
      recursive: true,
    });
  
    const { uri } = await Filesystem.getUri({
      directory: Directory.Documents,
      path: filename,
    });
  
    return { uri };   // ← uri를 반환하도록 수정
  } else {
    // 웹앱용 기존 다운로드 로직 (변경 없음)
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
}

// ---------- import ----------

export type ImportResult = { ok: true; imported: number } | { ok: false; reason: "invalid" | "wrong_password" };

export async function importBackupZip(file: File, pin: string): Promise<ImportResult> {
  if (!/^\d{4}$/.test(pin)) return { ok: false, reason: "wrong_password" };

  let outer: JSZip;
  try {
    outer = await JSZip.loadAsync(file);
  } catch {
    return { ok: false, reason: "invalid" };
  }

  const metaFile = outer.file("meta.json");
  const payloadFile = outer.file("payload.enc");
  if (!metaFile || !payloadFile) return { ok: false, reason: "invalid" };

  let meta: any;
  try {
    meta = JSON.parse(await metaFile.async("string"));
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (
    !meta ||
    (meta.app !== APP_NAME && !LEGACY_APP_NAMES.includes(meta.app)) ||
    typeof meta.salt !== "string" ||
    typeof meta.iv !== "string"
  ) {
    return { ok: false, reason: "invalid" };
  }

  const salt = b64decode(meta.salt);
  const iv = b64decode(meta.iv);
  const cipher = await payloadFile.async("uint8array");

  let plain: Uint8Array;
  try {
    const key = await deriveKey(pin, salt);
    plain = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv.buffer.slice(0) as ArrayBuffer },
        key,
        (cipher as Uint8Array).buffer.slice(0) as ArrayBuffer,
      ),
    );
  } catch {
    return { ok: false, reason: "wrong_password" };
  }

  let inner: JSZip;
  try {
    inner = await JSZip.loadAsync(plain);
  } catch {
    return { ok: false, reason: "invalid" };
  }

  const manifestFile = inner.file("manifest.json");
  if (!manifestFile) return { ok: false, reason: "invalid" };
  let manifest: any;
  try {
    manifest = JSON.parse(await manifestFile.async("string"));
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (
    !manifest ||
    (manifest.app !== APP_NAME && !LEGACY_APP_NAMES.includes(manifest.app)) ||
    !Array.isArray(manifest.albums)
  ) {
    return { ok: false, reason: "invalid" };
  }

  const existing = (await get<Album[]>(KEY)) ?? [];
  const existingIds = new Set(existing.map((a) => a.id));
  const restored: Album[] = [];

  for (const m of manifest.albums) {
    const dir = `albums/${m.id}`;
    const albumJsonFile = inner.file(`${dir}/album.json`);
    if (!albumJsonFile) continue;
    let albumJson: any;
    try {
      albumJson = JSON.parse(await albumJsonFile.async("string"));
    } catch {
      continue;
    }

    const photoFiles = Object.keys(inner.files)
      .filter((p) => p.startsWith(`${dir}/photos/`) && !inner.files[p].dir)
      .sort();

    const photos: Album["photos"] = [];
    for (let i = 0; i < photoFiles.length; i++) {
      const path = photoFiles[i];
      const ext = path.split(".").pop()?.toLowerCase() || "jpg";
      const bytes = await inner.file(path)!.async("uint8array");
      const dataUrl = bytesToDataUrl(bytes, ext);
      const caption =
        Array.isArray(albumJson.photos) && albumJson.photos[i]?.caption ? String(albumJson.photos[i].caption) : "";
      photos.push({ dataUrl, caption });
    }

    let id = String(albumJson.id ?? m.id);
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
      lat: typeof albumJson.lat === "number" ? albumJson.lat : undefined,
      lng: typeof albumJson.lng === "number" ? albumJson.lng : undefined,
      tags: Array.isArray(albumJson.tags) ? albumJson.tags.map((t: unknown) => String(t)) : undefined,
      favorite: !!albumJson.favorite,
      photos,
      createdAt: Number(albumJson.createdAt ?? Date.now()),
    });
  }

  if (restored.length === 0) return { ok: true, imported: 0 };

  const merged = [...restored, ...existing];
  await set(KEY, merged);
  const storage = await import("./storage");
  storage.notifyAlbums();
  return { ok: true, imported: restored.length };
}
