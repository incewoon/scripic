import { createServerFn } from "@tanstack/react-start";

export const geocodeLocation = createServerFn({ method: "POST" })
  .inputValidator((input: { query: string }) => {
    if (!input || typeof input.query !== "string") throw new Error("invalid input");
    const q = input.query.trim();
    if (!q || q.length > 200) throw new Error("invalid query");
    return { query: q };
  })
  .handler(async ({ data }): Promise<{ lat: number; lng: number } | null> => {
    const lovableKey = process.env.LOVABLE_API_KEY;
    const connKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!lovableKey || !connKey) {
      throw new Error("Google Maps connector not configured");
    }
    const url = `https://connector-gateway.lovable.dev/google_maps/maps/api/geocode/json?address=${encodeURIComponent(data.query)}`;
    const r = await fetch(url, {
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": connKey,
      },
    });
    if (!r.ok) return null;
    const j: any = await r.json();
    const loc = j?.results?.[0]?.geometry?.location;
    if (!loc || typeof loc.lat !== "number" || typeof loc.lng !== "number") return null;
    return { lat: loc.lat, lng: loc.lng };
  });

export const reverseGeocodeCoords = createServerFn({ method: "POST" })
  .inputValidator((input: { lat: number; lng: number; lang?: string }) => {
    if (!input || typeof input.lat !== "number" || typeof input.lng !== "number") {
      throw new Error("invalid input");
    }
    if (input.lat < -90 || input.lat > 90 || input.lng < -180 || input.lng > 180) {
      throw new Error("invalid coords");
    }
    return {
      lat: input.lat,
      lng: input.lng,
      lang: typeof input.lang === "string" ? input.lang.slice(0, 8) : "en",
    };
  })
  .handler(async ({ data }): Promise<{ city?: string } | null> => {
    const lovableKey = process.env.LOVABLE_API_KEY;
    const connKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!lovableKey || !connKey) {
      throw new Error("Google Maps connector not configured");
    }
    const url = `https://connector-gateway.lovable.dev/google_maps/maps/api/geocode/json?latlng=${data.lat},${data.lng}&language=${encodeURIComponent(data.lang)}&result_type=locality|administrative_area_level_2|administrative_area_level_1|country`;
    const r = await fetch(url, {
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": connKey,
      },
    });
    if (!r.ok) return null;
    const j: any = await r.json();
    const results: any[] = j?.results || [];
    // Prefer the first result that has a locality / admin level component.
    const want = ["locality", "administrative_area_level_2", "administrative_area_level_1", "country"];
    for (const type of want) {
      for (const res of results) {
        const comp = res?.address_components?.find((c: any) => c.types?.includes(type));
        if (comp?.long_name) return { city: comp.long_name };
      }
    }
    const first = results[0]?.formatted_address;
    return first ? { city: first } : null;
  });
