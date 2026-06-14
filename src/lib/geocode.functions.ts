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
