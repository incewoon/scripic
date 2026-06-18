# 픽 맵 UX 강화: 검색 + 현재위치

현재 `MapDialog`의 픽 모드는 지도를 탭/드래그해서 핀을 찍는 방식만 지원합니다. 여기에 두 가지 입력 경로를 추가합니다.

## 1. 상단 검색창 (장소/주소 검색)

- `MapDialog` 픽 모드 헤더 아래에 검색 입력창 + 결과 드롭다운 추가.
- Google **Places API (New)** 사용 — 브라우저 키로 `AutocompleteSuggestion.fetchAutocompleteSuggestions()` 호출 (디바운스 300ms, 세션 토큰 사용).
- 결과 항목을 탭하면:
  1. `places/v1/places/{id}` 를 서버 함수로 호출해 `location`(lat/lng)과 `displayName`을 가져옴.
  2. 지도 중심/줌 이동 + 마커 표시 + `picked` 좌표 갱신.
  3. 저장 버튼을 누르면 기존 흐름대로 `reverseGeocodeCoords`로 짧은 라벨(구 + 동)을 만들어 저장 — 검색 결과의 풀네임이 아니라 일관된 짧은 라벨로 표시되도록 함.
- 새 서버 함수 `src/lib/places.functions.ts`:
  - `searchPlaces({ query, lang })` → 게이트웨이 `places/v1/places:searchText` 호출, 상위 5개 `{id, name, address, location}` 반환.
  - (선택) Autocomplete를 브라우저에서 직접 쓰는 대신 서버에서 `places:autocomplete` 호출하는 변형도 가능 — 검토 후 단순한 `searchText` 한 가지로 채택.

## 2. 현재 위치 버튼

- 검색창 우측에 위치 아이콘 버튼 추가.
- 탭 시 `navigator.geolocation.getCurrentPosition()` 호출 (브라우저가 권한 프롬프트 표시 — 동의는 OS/브라우저가 처리).
- 성공: 해당 좌표로 지도 중심 이동 + 마커 표시 + `picked` 갱신.
- 실패/거부: toast로 "위치 권한이 거부되었습니다. 지도를 탭하거나 검색하세요" 안내 (i18n).
- 권한 요청은 **사용자가 버튼을 눌렀을 때만** — 기존처럼 자동 호출하지 않음. 거부해도 기존 fallback(마지막 저장 좌표/한국 중심) 그대로 동작.

## 3. i18n 추가

`src/lib/i18n.ts`에 ko/en 두 세트 추가:
- `searchPlacePlaceholder` ("장소 또는 주소 검색")
- `useCurrentLocation` ("현재 위치 사용")
- `locationPermissionDenied` ("위치 권한이 거부되었습니다")
- `searchNoResults` ("검색 결과가 없습니다")

## 4. 저장 동작 (변경 없음 확인)

- 검색이든 현재위치든 지도탭이든, 최종 저장 좌표는 항상 사용자가 확정한 `picked` 그대로.
- 표시 라벨은 항상 `reverseGeocodeCoords`로 만든 짧은 라벨 → 일관성 유지.

## 영향 파일

- `src/components/MapDialog.tsx` — 검색바/현재위치 버튼 UI + 핸들러.
- `src/lib/places.functions.ts` (신규) — 서버 함수 `searchPlaces`.
- `src/lib/i18n.ts` — 신규 문자열.
- `.lovable/plan.md` — 변경 내역 갱신.

## 비변경 / 비목표

- 앨범 생성 시 EXIF 위치 추출은 그대로 비활성 유지.
- 자동 지오로케이션 권한 요청 금지 — 버튼 클릭 시에만.
- 라벨 포맷(구 + 동) 로직은 그대로.
