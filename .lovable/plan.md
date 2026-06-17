# 장소 추가 정확도/UX 개선

## 문제
1. 맵에서 핀을 찍어 장소를 추가/수정해도, 이후 화면에서는 핀 위치가 아닌 "요약 라벨(예: 강남구 역삼동)"을 재지오코딩한 좌표가 사용되어 마커가 실제 찍은 지점과 어긋남.
2. 픽 모드에서 기본 중심점을 잡기 위해 `navigator.geolocation` 권한을 요청하고 있음. 권한이 거부되면 세계지도(위도 20, 경도 0)로 떨어져 다른 나라가 보임.

## 수정 내용

### 1. `src/components/MapDialog.tsx` — 픽 좌표를 정확히 보존
- `confirmPick()`에서 `onPick`에 넘기는 `{lat, lng}`은 사용자가 클릭/드래그한 `picked` 값 그대로 (현재 동작 유지). 라벨은 표시용으로만 사용.
- 뷰 모드에서 `onCoordsResolved` 콜백이 의도치 않게 저장된 좌표를 덮어쓰지 않도록, 이미 `initialCoords`가 주어졌으면 재지오코딩/콜백 호출 자체를 건너뜀 (현재 `if (!c)` 가드 유지 + 명확화).
- 픽 모드 진입 시 `navigator.geolocation` 호출 블록 제거.
- 픽 모드 기본 중심 우선순위:
  1) `initialCoords` (현재 앨범의 저장 좌표)
  2) 외부에서 주입된 `fallbackCenter` (마지막 저장 좌표)
  3) 그래도 없으면 줌 아웃된 기본값 (한국 중심으로)
- 새 prop: `fallbackCenter?: { lat: number; lng: number }`.

### 2. `src/lib/storage.ts` — 최근 저장 좌표 헬퍼
- `getLastSavedCoords(): Promise<{lat:number;lng:number} | null>` 추가.
  - `getAlbums()`에서 `lat`/`lng`가 있는 앨범 중 가장 최근 `createdAt` 기준으로 반환.

### 3. `src/routes/album.$id.tsx` — 픽 모드에 fallback 전달
- 컴포넌트 마운트 시 `getLastSavedCoords()`를 한 번 읽어 state(`lastCoords`)에 저장.
- `<MapDialog ... fallbackCenter={lastCoords ?? undefined} />` 전달.
- `onCoordsResolved`는 그대로 두되, 픽 결과로 저장된 `album.lat/lng`가 있으면 호출되지 않음 (MapDialog 가드 덕분).

## 결과
- 앨범의 `location` 텍스트는 짧은 라벨, `lat`/`lng`는 사용자가 실제로 찍은 좌표가 1:1로 저장/표시됨.
- 픽 맵을 열면 (a) 현재 앨범 좌표 → (b) 직전 앨범 저장 좌표 → (c) 한국 중심 순으로 중심이 잡혀, 권한 없이도 엉뚱한 나라가 뜨지 않음.
