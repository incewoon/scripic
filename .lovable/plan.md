# 앨범 위치 처리 변경 + 편집 안내 코치마크

## 1) 앨범 생성 시 위치 추출 제거

목표: 사진 EXIF의 위치(lat/lng/city)를 앨범에 더 이상 채우지 않는다. 생성 직후 `album.location`, `album.lat`, `album.lng`는 모두 `undefined`(=null값 디폴트).

변경:
- `src/lib/photoMeta.ts`
  - `extractMeta()`에서 `latitude`/`longitude`/`gps` 옵션 제거. `takenAt`만 추출(기간 표시는 유지).
  - `reverseGeocode()`, `summarizeLocations()`, `PhotoMeta.lat/lng/city` 필드 삭제.
- `src/routes/chat.tsx`
  - `albumSafeLocation()` 호출과 `aiGenerateAlbum`에 들어가던 location 폴백 제거.
  - 저장 시 `album` 객체에 `lat/lng/location` 넣지 않음(완전히 비움).
  - AI가 생성한 location 텍스트도 무시(빈 값 강제). → AI가 사진에 없는 장소를 추측 표기하는 것 방지.

기간(period) 로직은 그대로 유지.

## 2) 앨범 상세에서 지도로 장소 직접 선택

목표: 사용자가 상세화면의 "장소" 영역을 탭 → 구글 지도 모달이 열리고, 지도 위의 한 지점을 탭(또는 드래그 핀)해서 좌표를 확정 → 역지오코딩으로 "도시 + 동(구역)" 짧은 텍스트가 `album.location`에 저장, 좌표는 `album.lat/lng`에 저장.

변경:
- `src/components/MapDialog.tsx` — 픽커 모드 추가
  - 새 prop `mode: "view" | "pick"`. 기본 view(기존 동작 유지).
  - pick 모드:
    - 초기 중심: `initialCoords` → 없으면 브라우저 geolocation → 없으면 전 세계 zoom 2.
    - 지도 클릭(`map.addListener("click", ...)`)으로 마커 위치 이동. 드래그 가능한 마커.
    - 하단에 "이 위치로 저장" 버튼 → onConfirm({lat,lng, label}) 호출.
    - 확정 시 `reverseGeocodeCoords({lat,lng,lang})` 호출해 짧은 라벨 생성(아래 §3).
- `src/routes/album.$id.tsx`
  - 장소 칩: `album.location`이 있으면 텍스트로(탭 시 지도 view로 열기 — 현재 동작 유지).
  - 장소가 없으면 "+ 장소 추가" 버튼 표시. 탭 시 MapDialog를 pick 모드로 오픈.
  - `onConfirm`에서 `patch({ location, lat, lng })` 저장.
  - 편집 모드(연필)에서도 장소 영역에 "지도로 변경" 액션 노출(텍스트 직접 편집은 유지).
  - 기존 EXIF 기반 backfill effect(`reverseGeocode` 자동 호출) 제거.

## 3) 짧은 라벨 ("도시 + 동" 정도)

`src/lib/geocode.functions.ts`의 `reverseGeocodeCoords` 응답을 라벨 친화적으로 변경:
- `result_type` 필터 제거하고 전체 결과 사용.
- address_components에서 다음을 조합해 `label` 반환:
  - 한국(`country == "KR"`): `locality`(시) + `sublocality_level_1`(구) + `sublocality_level_2`(동). 예: "서울특별시 강남구 역삼동" → 너무 길면 `locality_short` + `sublocality_level_2` 두 토큰만.
  - 그 외: `locality` + `sublocality`/`neighborhood` 두 토큰. 없으면 `locality` + `administrative_area_level_1`.
- 반환 타입: `{ label: string; city?: string }`. 호출부는 `label`을 `album.location`에 저장.

언어는 `navigator.language` 기반(`ko`/`en`).

## 4) 생성 직후 1회 코치마크(편집 가능 안내)

목표: 앨범 생성 후 상세화면 진입 시 단 1번, 어두운 오버레이 위에 편집 버튼(연필, 장소 추가 버튼)을 실루엣처럼 강조하고 "내용을 수정하거나 장소를 추가할 수 있어요" 안내 표시.

구현:
- 새 컴포넌트 `src/components/EditCoachmark.tsx`
  - 화면 전체 fixed 오버레이(`bg-black/60`), 클릭 또는 "확인" 버튼으로 닫힘.
  - 강조 대상 두 곳(연필 버튼, 장소 칩/추가 버튼)을 화면 좌표로 받아 그 영역만 `box-shadow: 0 0 0 9999px rgba(0,0,0,0.6)` 트릭 또는 SVG 마스크로 뚫어 하이라이트(살짝 펄스 애니메이션).
  - 안내 문구: i18n 키 `editCoachTitle`("이 앨범을 다듬어보세요"), `editCoachBody`("내용을 수정하거나 장소를 추가할 수 있어요"), `editCoachOk`("확인").
- `src/lib/i18n.ts`에 위 3개 키(ko/en) 추가.
- 트리거:
  - `src/routes/chat.tsx`의 `finish()`에서 새 앨범 저장 시 `sessionStorage.setItem("scripic:justCreated", album.id)` 마킹.
  - `src/routes/album.$id.tsx`에서 마운트 시 해당 키가 현재 앨범 id와 같으면 코치마크 표시 후 즉시 키 삭제(→ 동일 앨범 재방문 시에는 표시 안 됨). 영구적으로 1회만 보장하기 위해 `localStorage` 키 `scripic:editHinted`도 같이 set, 이미 set이면 표시 생략(전 사용자 1회).
- ref 두 개(`pencilBtnRef`, `locationChipRef`)를 만들어 코치마크에 전달.

## 기술 메모

- `MapDialog`의 기존 `loadGoogleMaps`/`google.maps.Marker` 활용. pick 모드는 `map.addListener("click", e => marker.setPosition(e.latLng))` + `marker.draggable = true`로 처리.
- 픽커에서 사용자가 지점을 옮긴 뒤에만 "저장" 활성화(좌표가 정해진 상태).
- 역지오코딩 실패 시 좌표("37.5°N, 127.0°E")를 라벨로 폴백.
- `Album` 타입(`lat/lng`)은 유지 — 지도 표시/공유에 그대로 사용.
- 기존 EXIF 좌표가 저장돼 있는 과거 앨범은 그대로 보존(읽기 전용). 새 생성만 영향.

## 변경 요약 파일 목록

- `src/lib/photoMeta.ts` — EXIF GPS 제거, reverseGeocode/summarizeLocations 삭제.
- `src/routes/chat.tsx` — location 채우는 로직 제거, justCreated 세션 마킹.
- `src/lib/geocode.functions.ts` — 짧은 한국식/일반 라벨 반환.
- `src/components/MapDialog.tsx` — pick 모드 추가, onConfirm 콜백.
- `src/routes/album.$id.tsx` — "+ 장소 추가" UI, pick 모드 연동, backfill 제거, 코치마크 마운트.
- `src/components/EditCoachmark.tsx` — 신규.
- `src/lib/i18n.ts` — 3개 키 추가.
