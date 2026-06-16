import exifr from "exifr";

export type PhotoMeta = {
  takenAt?: string; // ISO date
  // Location fields intentionally omitted at creation time. Older albums may
  // still carry lat/lng/city — we keep the type optional for compatibility,
  // but we no longer populate them when creating new albums.
  lat?: number;
  lng?: number;
  city?: string;
};

export async function extractMeta(file: File): Promise<PhotoMeta> {
  try {
    const data = await exifr.parse(file, { gps: false, pick: ["DateTimeOriginal", "CreateDate"] });
    if (!data) return {};
    const date: Date | undefined = data.DateTimeOriginal || data.CreateDate;
    return {
      takenAt: date ? new Date(date).toISOString() : undefined,
    };
  } catch {
    return {};
  }
}

export function summarizePeriod(metas: PhotoMeta[], lang: string): string | undefined {
  const dates = metas.map(m => m.takenAt).filter(Boolean).map(d => new Date(d!));
  if (!dates.length) return undefined;
  dates.sort((a, b) => a.getTime() - b.getTime());
  const first = dates[0];
  const last = dates[dates.length - 1];
  const fmt = (d: Date) => {
    const yyyy = String(d.getFullYear());
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}.${mm}.${dd}`;
  };
  if (first.toDateString() === last.toDateString()) return fmt(first);
  if (first.getFullYear() === last.getFullYear() && first.getMonth() === last.getMonth()) {
    return `${fmt(first)}~${String(last.getDate()).padStart(2, "0")}`;
  }
  return `${fmt(first)}~${fmt(last)}`;
}
