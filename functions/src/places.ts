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
    secrets: [GOOGLE_MAPS_API_KEY],
  },
  async (request): Promise<{ label: string }> => {
    const { lat, lng, lang = "ko" } = request.data as {
      lat: number;
      lng: number;
      lang?: string;
    };

    console.log(`[reverseGeocode] 요청: lat=${lat}, lng=${lng}, lang=${lang}`);

    if (typeof lat !== "number" || typeof lng !== "number") {
      console.error("[reverseGeocode] 잘못된 좌표");
      throw new HttpsError("invalid-argument", "lat, lng가 필요합니다.");
    }

    const apiKey = GOOGLE_MAPS_API_KEY.value();

    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&language=${lang}&key=${apiKey}`
      );

      if (!response.ok) {
        console.error(`[reverseGeocode] API 호출 실패: ${response.status}`);
        return { label: `${lat.toFixed(3)}, ${lng.toFixed(3)}` };
      }

      const data: any = await response.json();
      console.log(`[reverseGeocode] API 응답 결과 수: ${data.results?.length || 0}`);

      const results = data.results || [];
      
      if (results.length === 0) {
        console.warn("[reverseGeocode] 결과 없음");
        return { label: `${lat.toFixed(3)}, ${lng.toFixed(3)}` };
      }
      
      // ★ 모든 result의 address_components를 하나로 합쳐서 검색
      const allComponents = results.flatMap((r: any) => r.address_components || []);

      const get = (type: string) =>
        allComponents.find((c: any) => c.types.includes(type))?.long_name;
      
      const levels: string[] = [];
      
      // 1. 시/도
      const level1 = get("administrative_area_level_1");
      if (level1) levels.push(level1);
      
      // 2. 시/군/구 — 후보를 순서대로 시도하되, level1과 같으면 스킵
      const level2Candidates = [
        get("sublocality_level_1"),        // 구 (유성구 등)
        get("administrative_area_level_2"), // 광역시에서 구가 여기로 오는 경우
        get("locality"),                    // 일반 시
      ];
      
      const level2 = level2Candidates.find((v) => v && v !== level1);
      if (level2) levels.push(level2);
      
      // 3. 동/리 (route는 최후 fallback)
      const level3 =
        get("sublocality_level_2") ||
        get("sublocality") ||
        get("neighborhood") ||
        get("route");
      
      if (level3 && level3 !== level2) levels.push(level3);
      
      const shortLabel = levels.length > 0 
        ? levels.slice(0, 3).join(" ") 
        : results[0].formatted_address;
      
      console.log(`[reverseGeocode] level1: ${level1}, level2: ${level2}, level3: ${level3}`);
      console.log(`[reverseGeocode] 최종 shortLabel: ${shortLabel}`);
      
      return { label: shortLabel || `${lat.toFixed(3)}, ${lng.toFixed(3)}` };
    } catch (error) {
      console.error("[reverseGeocode] 전체 오류:", error);
      return { label: `${lat.toFixed(3)}, ${lng.toFixed(3)}` };
    }
  }
);

// === 정방향 지오코딩 (주소 → 좌표) ===
export const geocodeLocation = onCall(
  {
    enforceAppCheck: true,
    secrets: [GOOGLE_MAPS_API_KEY], // 기존에 사용 중인 secret 변수명으로 맞춰주세요
  },
  async (request) => {
    const { query, lang = "ko" } = request.data as { query: string; lang?: string };

    if (!query || typeof query !== "string") {
      throw new HttpsError("invalid-argument", "query가 필요합니다.");
    }

    const apiKey = GOOGLE_MAPS_API_KEY.value();

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
