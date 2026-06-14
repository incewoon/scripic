# 위치 → 지도 팝업 → 구글맵 이동

앨범 상세 페이지에서 위치 텍스트를 탭하면 Google Maps JS SDK 지도가 다이얼로그로 열리고, 그 지도를 다시 탭하면 안내 모달이 떴다가 확인 시 디바이스의 구글맵 앱(또는 웹)으로 이동합니다.

## 1. 지오코딩 (좌표 확보)

지도에 핀을 찍으려면 위경도가 필요합니다. 우선순위:

1. **사진 EXIF에 GPS가 있는 경우** — `album.photos` 중 가장 첫 사진의 `lat/lng`를 사용. (현재 `extractMeta`가 추출하지만 앨범 저장 시 photo에 보존하는지 확인 필요 → 보존되어 있지 않다면 `Album` 타입에 `lat?/lng?` 추가하고 생성 플로우에서 대표 좌표를 함께 저장)
2. **좌표가 없고 `location` 텍스트만 있는 경우** — Google Geocoding API(커넥터 게이트웨이)로 텍스트 → 좌표 변환, 결과를 해당 앨범에 캐시 저장(`album.lat/lng`).
3. **둘 다 없으면** 위치 텍스트는 평문으로 표시(현재 동작 유지).

> Geocoding은 서버 함수에서 호출(커넥터 게이트웨이는 LOVABLE_API_KEY 필요, 브라우저 키로는 REQUEST_DENIED). `src/lib/geocode.functions.ts`에 `createServerFn` 한 개 추가.

## 2. UI 변경 (`src/routes/album.$id.tsx`)

- 헤더 메타 영역의 `<MapPin/> + location` 묶음을 **버튼으로 전환**(편집 모드가 아닐 때만, 좌표가 있을 때만). 편집 모드에서는 기존 `EditableText` 그대로.
- 클릭 시 `<MapDialog>` 오픈.

신규 컴포넌트 `src/components/MapDialog.tsx`:

- shadcn `Dialog` 사용. 모바일을 고려해 가로 max-w-md, 정사각 지도 영역.
- Google Maps JS SDK를 `loading=async&callback=...` 패턴으로 1회만 로드(가드용 싱글톤). 채널 파라미터 포함.
- `new google.maps.Map`로 핀(고전 `Marker`) 1개 표시, `gestureHandling: "cooperative"`, `disableDefaultUI` 약간 정리.
- 지도 컨테이너에 투명 오버레이를 두고 **클릭 시 안내 모달 표시** (지도 자체 인터랙션은 동작하지만, 한번 탭하면 인텐트로 간주). 또는 더 자연스럽게: 지도 아래에 큰 "구글맵에서 열기" 버튼 + 지도 클릭에도 동일 핸들러를 연결.
- 안내 모달(`AlertDialog`):
  - 제목: "구글맵에 저장할 수 있어요"
  - 본문: 요약 가이드 (예: "1) 구글맵이 열리면 핀을 길게 눌러 저장 → 2) '저장' 선택 → 3) 원하는 목록 선택")
  - 버튼: 취소 / 구글맵으로 이동
- 이동 핸들러: `window.location.href = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}``
  - Android Capacitor에서 자동으로 구글맵 앱이 떠 있으면 인텐트가 잡아 앱으로 열림. 웹에서는 새 탭(maps.google.com).

## 3. i18n (`src/lib/i18n.ts`)

신규 키 (ko/en):

- `openInMap`: "지도에서 보기" / "View on map"
- `saveToGoogleMapsTitle`: "구글맵에 저장할 수 있어요" / "Save this place to Google Maps"
- `saveToGoogleMapsBody`: "구글맵 앱이 열리면: 1) 핀을 길게 누르기 2) '저장' 선택 3) 원하는 목록에 추가" / "After Google Maps opens: 1) long-press the pin 2) tap 'Save' 3) choose a list"
- `openGoogleMaps`: "구글맵으로 이동" / "Open Google Maps"
- `mapUnavailable`: "이 앨범에는 위치 좌표가 없어요" / "No coordinates for this album"

## 4. 커넥터 / 설정

- Google Maps Platform 커넥터가 이미 연결되어 있다고 가정(없으면 첫 사용 시 안내). `VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY`, `VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID` 사용.
- Geocoding(텍스트→좌표 fallback)에는 서버 함수 + 게이트웨이 사용.

## 5. 검증

- TS 컴파일 통과.
- 좌표 있는 앨범 상세에서 위치 탭 → 다이얼로그 열림, 지도 핀 표시 확인.
- 지도/버튼 탭 → 안내 모달 → "이동" 클릭 시 구글맵 URL 열림(웹 프리뷰는 새 탭, Android 앱은 구글맵 앱).
- 좌표 없는 앨범은 위치 텍스트가 버튼이 아니라 평문 그대로(혹은 toast로 `mapUnavailable`).

## 변경 없음

- 메인 페이지(즐겨찾기/검색/태그) 로직, 백업/저장 포맷 호환 유지(`lat/lng`는 선택 필드).

## 질문(선택)

A. 좌표 fallback을 위해 **`location` 텍스트 자동 지오코딩**까지 추가할까요, 아니면 **EXIF GPS가 있는 앨범만** 지도 버튼이 보이게 할까요? (후자면 서버 함수/Geocoding 단계 제거되어 더 가볍습니다)
B. 안내 모달의 "구글맵에서 저장하는 방법"을 위 3단계 요약으로 갈까요, 아니면 더 짧게("앱이 열리면 핀을 길게 눌러 저장하세요")로 갈까요?
