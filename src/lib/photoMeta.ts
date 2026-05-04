import exifr from "exifr";

export type PhotoMeta = {
  takenAt?: string; // ISO date
  lat?: number;
  lng?: number;
  city?: string;
};

export async function extractMeta(file: File): Promise<PhotoMeta> {
  try {
    const data = await exifr.parse(file, { gps: true, pick: ["DateTimeOriginal", "CreateDate", "latitude", "longitude"] });
    if (!data) return {};
    const date: Date | undefined = data.DateTimeOriginal || data.CreateDate;
    return {
      takenAt: date ? new Date(date).toISOString() : undefined,
      lat: data.latitude,
      lng: data.longitude,
    };
  } catch {
    return {};
  }
}

const cityCache = new Map<string, string>();

export async function reverseGeocode(lat: number, lng: number, lang: string): Promise<string | undefined> {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}|${lang}`;
  if (cityCache.has(key)) return cityCache.get(key);
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10&accept-language=${lang}`,
      { headers: { Accept: "application/json" } },
    );
    if (!r.ok) return undefined;
    const j = await r.json();
    const a = j.address || {};
    const city = a.city || a.town || a.village || a.county || a.state || a.country;
    if (city) cityCache.set(key, city);
    return city;
  } catch {
    return undefined;
  }
}

export function summarizePeriod(metas: PhotoMeta[], lang: string): string | undefined {
  const dates = metas.map(m => m.takenAt).filter(Boolean).map(d => new Date(d!));
  if (!dates.length) return undefined;
  dates.sort((a, b) => a.getTime() - b.getTime());
  const first = dates[0];
  const last = dates[dates.length - 1];
  const fmt = (d: Date) => {
    const yy = String(d.getFullYear()).slice(2);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yy}.${mm}.${dd}`;
  };
  if (first.toDateString() === last.toDateString()) return fmt(first);
  // same year+month → "26.4.24~25"
  if (first.getFullYear() === last.getFullYear() && first.getMonth() === last.getMonth()) {
    return `${fmt(first)}~${String(last.getDate()).padStart(2, "0")}`;
  }
  return `${fmt(first)}~${fmt(last)}`;
}

export function summarizeLocations(metas: PhotoMeta[]): string | undefined {
  const cities = Array.from(new Set(metas.map(m => m.city).filter(Boolean) as string[]));
  if (!cities.length) return undefined;
  return cities.slice(0, 3).join(", ");
}
