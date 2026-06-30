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
// === 역지오코딩 함수 추가 ===
export const reverseGeocode = onCall(
  {
    enforceAppCheck: true,
    secrets: [serverKey], // 기존에 사용하던 secret 변수명에 맞춰주세요
  },
  async (request): Promise<{ label: string }> => {
    const { lat, lng, lang = "ko" } = request.data as {
      lat: number;
      lng: number;
      lang?: string;
    };

    if (typeof lat !== "number" || typeof lng !== "number") {
      throw new HttpsError("invalid-argument", "lat, lng가 필요합니다.");
    }

    const apiKey = serverKey.value();

    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&language=${lang}&key=${apiKey}`
      );

      if (!response.ok) {
        return { label: `${lat.toFixed(3)}, ${lng.toFixed(3)}` };
      }

      const data: any = await response.json();
      const results = data.results || [];

      if (results.length === 0) {
        return { label: `${lat.toFixed(3)}, ${lng.toFixed(3)}` };
      }

      // 기존과 유사한 주소 파싱 로직
      const components = results[0].address_components || [];
      const levels: string[] = [];

      const level1 = components.find((c: any) =>
        c.types.includes("administrative_area_level_1")
      ) || components.find((c: any) => c.types.includes("locality"));
      if (level1) levels.push(level1.long_name);

      const level2 = components.find((c: any) =>
        c.types.includes("sublocality_level_1")
      ) || components.find((c: any) => c.types.includes("locality") && c.long_name !== levels[0]);
      if (level2) levels.push(level2.long_name);

      const level3 = components.find((c: any) =>
        c.types.includes("sublocality_level_2") ||
        c.types.includes("sublocality") ||
        c.types.includes("neighborhood")
      );
      if (level3) levels.push(level3.long_name);

      const shortLabel = levels.length >= 2 ? levels.slice(0, 3).join(" ") : results[0].formatted_address;

      return { label: shortLabel || `${lat.toFixed(3)}, ${lng.toFixed(3)}` };
    } catch (error) {
      console.error("reverseGeocode error:", error);
      return { label: `${lat.toFixed(3)}, ${lng.toFixed(3)}` };
    }
  }
);
// === 정방향 지오코딩 (주소 → 좌표) ===
export const geocodeLocation = onCall(
  {
    enforceAppCheck: true,
    secrets: [serverKey], // 기존에 사용 중인 secret 변수명으로 맞춰주세요
  },
  async (request) => {
    const { query, lang = "ko" } = request.data as { query: string; lang?: string };

    if (!query || typeof query !== "string") {
      throw new HttpsError("invalid-argument", "query가 필요합니다.");
    }

    const apiKey = serverKey.value();

    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&language=${lang}&key=${apiKey}`
      );

      if (!response.ok) {
        return null;
      }

      const data: any = await response.json();
      const result = data.results?.[0];

      if (!result || !result.geometry?.location) {
        return null;
      }

      return {
        lat: result.geometry.location.lat,
        lng: result.geometry.location.lng,
      };
    } catch (error) {
      console.error("geocodeLocation error:", error);
      return null;
    }
  }
);
