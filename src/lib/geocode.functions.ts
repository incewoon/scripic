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

/**
 * Reverse-geocode a lat/lng into a SHORT human label ("city + district/dong"),
 * suitable for showing in an album header. Returns `label` plus the broader
 * `city` for fallback display.
 */
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
  .handler(async ({ data }): Promise<{ label: string; city?: string } | null> => {
    const lovableKey = process.env.LOVABLE_API_KEY;
    const connKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!lovableKey || !connKey) {
      throw new Error("Google Maps connector not configured");
    }
    const url = `https://connector-gateway.lovable.dev/google_maps/maps/api/geocode/json?latlng=${data.lat},${data.lng}&language=${encodeURIComponent(data.lang)}`;
    const r = await fetch(url, {
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": connKey,
      },
    });
    if (!r.ok) return null;
    const j: any = await r.json();
    const results: any[] = j?.results || [];
    if (!results.length) return null;

    // Gather best matches for each component type across all results.
    function findComp(type: string): string | undefined {
      for (const res of results) {
        const comp = res?.address_components?.find((c: any) => c.types?.includes(type));
        if (comp?.long_name) return comp.long_name as string;
      }
      return undefined;
    }
    function findCompShort(type: string): string | undefined {
      for (const res of results) {
        const comp = res?.address_components?.find((c: any) => c.types?.includes(type));
        if (comp?.short_name) return comp.short_name as string;
      }
      return undefined;
    }

    const country = findCompShort("country");
    const locality = findComp("locality");
    const admin1 = findComp("administrative_area_level_1");
    const admin2 = findComp("administrative_area_level_2");
    const sub1 = findComp("sublocality_level_1");
    const sub2 = findComp("sublocality_level_2");
    const neighborhood = findComp("neighborhood");

    let label = "";
    let city: string | undefined;

    if (country === "KR") {
      // Korea: prefer "구 + 동" — that's what users picture as a "short" place.
      city = locality || admin1;
      const dong = sub2 || neighborhood;
      const gu = sub1 || admin2;
      const parts = [city, gu, dong].filter(Boolean) as string[];
      // Keep at most two tokens: prefer (gu, dong) when both exist.
      if (gu && dong) label = `${gu} ${dong}`;
      else if (city && (gu || dong)) label = `${city} ${gu || dong}`;
      else label = parts.join(" ");
    } else {
      city = locality || admin1;
      const small = sub1 || sub2 || neighborhood;
      if (city && small) label = `${small}, ${city}`;
      else label = city || admin1 || findComp("country") || "";
    }

    if (!label) {
      label = results[0]?.formatted_address || "";
    }
    if (!label) return null;
    return { label, city };
  });
