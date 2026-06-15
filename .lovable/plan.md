## 목표
앨범 만들 때 대표 사진(첫 번째)의 EXIF GPS 좌표를 그대로 앨범에 저장하고, 지도 팝업이 그 좌표를 바로 사용하도록 한다. 화면에 보이는 위치 텍스트는 지금처럼 도시명 수준만 유지한다.

## 현재 문제
- `extractMeta`는 EXIF lat/lng를 뽑지만 앨범에는 저장되지 않음.
- `MapDialog`는 매번 `location` 텍스트(도시명, 예: "서울")를 Geocoding API로 다시 좌표 변환 → 도시 중심점으로 찍혀서 실제 촬영지와 어긋남.

## 변경 사항

### 1. `src/lib/storage.ts`
`Album` 타입에 좌표 필드 추가:
```ts
lat?: number;
lng?: number;
```

### 2. `src/routes/chat.tsx` (saveAlbum 호출부)
대표 사진(첫 번째)의 `photoMetas[0]`에서 `lat`/`lng`가 있으면 그대로 저장:
```ts
lat: photoMetas[0]?.lat,
lng: photoMetas[0]?.lng,
```
사진 순서가 드래그로 바뀐 경우에도 `memori_photo_metas`는 `create.tsx`에서 이미 정렬된 순서로 저장되므로 그대로 사용 가능.

### 3. `src/routes/album.$id.tsx`
`MapDialog`에 `initialCoords`를 전달:
```tsx
initialCoords={
  album.lat != null && album.lng != null
    ? { lat: album.lat, lng: album.lng }
    : undefined
}
```
좌표가 있으면 지도 버튼 표시, 없으면 도시명 텍스트만 보이는 기존 분기 유지.

### 4. `MapDialog`는 수정 없음
이미 `initialCoords`를 받으면 Geocoding을 스킵하고 바로 지도에 마커를 찍는 구조라 그대로 사용. EXIF 좌표가 없는 과거 앨범은 기존처럼 텍스트 Geocoding으로 폴백.

## 표시 정책 (변경 없음)
- 헤더의 위치 텍스트: 기존 `summarizeLocations` 결과(도시명) 그대로.
- 정확한 좌표는 내부 저장 + 지도 표시에만 사용 → 프라이버시 노출 없이 지도 정확도만 향상.

## 검증
- 새 앨범 생성 → IndexedDB Album에 `lat/lng` 저장 확인
- 앨범 상세 → 위치 클릭 → 지도가 도시 중심이 아니라 실제 촬영 지점에 마커 표시
- EXIF 없는 사진으로 만든 앨범 → 기존처럼 도시명 텍스트 Geocoding 폴백 동작
- TypeScript 컴파일 통과
