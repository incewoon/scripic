import { createServerFn } from "@tanstack/react-start";

export type PlaceSearchResult = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
};

export const searchPlaces = createServerFn({ method: "POST" })
  .inputValidator((input: { query: string; lang?: string }) => {
    if (!input || typeof input.query !== "string") throw new Error("invalid input");
    const q = input.query.trim();
    if (!q || q.length > 200) throw new Error("invalid query");
    return {
      query: q,
      lang: typeof input.lang === "string" ? input.lang.slice(0, 8) : "en",
    };
  })
  .handler(async ({ data }): Promise<PlaceSearchResult[]> => {
    const lovableKey = process.env.LOVABLE_API_KEY;
    const connKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!lovableKey || !connKey) {
      throw new Error("Google Maps connector not configured");
    }
    const r = await fetch(
      "https://connector-gateway.lovable.dev/google_maps/places/v1/places:searchText",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "X-Connection-Api-Key": connKey,
          "Content-Type": "application/json",
          "X-Goog-FieldMask":
            "places.id,places.displayName,places.formattedAddress,places.location",
        },
        body: JSON.stringify({
          textQuery: data.query,
          languageCode: data.lang,
          pageSize: 5,
        }),
      },
    );
    if (!r.ok) return [];
    const j: any = await r.json();
    const places: any[] = j?.places || [];
    return places
      .map((p) => {
        const lat = p?.location?.latitude;
        const lng = p?.location?.longitude;
        if (typeof lat !== "number" || typeof lng !== "number") return null;
        return {
          id: String(p?.id ?? ""),
          name: String(p?.displayName?.text ?? ""),
          address: String(p?.formattedAddress ?? ""),
          lat,
          lng,
        } satisfies PlaceSearchResult;
      })
      .filter((x): x is PlaceSearchResult => !!x);
  });
