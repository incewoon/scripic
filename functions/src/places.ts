// functions/src/places.ts
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { setGlobalOptions } from "firebase-functions/v2";

setGlobalOptions({
  region: "us-central1",
  memory: "256MiB",
  timeoutSeconds: 60,
  maxInstances: 10,
});

const GOOGLE_MAPS_API_KEY = defineSecret("Scripic-Maps-Server-Key");

interface SearchPlacesInput {
  query: string;
  lang?: string;
}

interface PlaceSearchResult {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
}

export const searchPlaces = onCall(
  {
    enforceAppCheck: true,
    secrets: [GOOGLE_MAPS_API_KEY],
  },
  async (request): Promise<PlaceSearchResult[]> => {
    const { query, lang = "ko" } = request.data as SearchPlacesInput;

    if (!query || typeof query !== "string" || query.trim().length === 0) {
      throw new HttpsError("invalid-argument", "query가 필요합니다.");
    }

    const apiKey = GOOGLE_MAPS_API_KEY.value();
    if (!apiKey) {
      throw new HttpsError("failed-precondition", "Google Maps API Key가 설정되지 않았습니다.");
    }

    try {
      const response = await fetch(
        "https://places.googleapis.com/v1/places:searchText",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": apiKey,
            "X-Goog-FieldMask":
              "places.id,places.displayName,places.formattedAddress,places.location",
          },
          body: JSON.stringify({
            textQuery: query.trim(),
            languageCode: lang,
            pageSize: 8,
          }),
        }
      );

      if (!response.ok) {
        console.error("Places API Error:", await response.text());
        return [];
      }

      const data: any = await response.json();
      const places: any[] = data.places || [];

      return places
        .map((place: any) => {
          const lat = place?.location?.latitude;
          const lng = place?.location?.longitude;

          if (typeof lat !== "number" || typeof lng !== "number") {
            return null;
          }

          return {
            id: String(place.id ?? ""),
            name: String(place.displayName?.text ?? ""),
            address: String(place.formattedAddress ?? ""),
            lat,
            lng,
          } as PlaceSearchResult;
        })
        .filter((p): p is PlaceSearchResult => p !== null);
    } catch (error) {
      console.error("searchPlaces error:", error);
      throw new HttpsError("internal", "장소 검색 중 오류가 발생했습니다.");
    }
  }
);
