# 즐겨찾기 (Favorite) 기능 추가

메인 화면의 각 앨범 카드 좌측 상단에 별표 버튼을 두고, 활성화한 앨범은 항상 리스트 상단에 고정합니다.

## 1. 데이터 모델

**`src/lib/storage.ts`**
- `Album` 타입에 `favorite?: boolean` 추가 (선택 필드, 기존 데이터 마이그레이션 불필요 — undefined는 false 취급).
- 기존 `updateAlbum(id, patch)` 함수를 그대로 사용해 토글 저장.

## 2. 메인 화면 (`src/routes/index.tsx`)

### 별표 토글 버튼
각 앨범 카드 좌측 상단(현재 우측 상단에는 추가 사진 썸네일이 있음)에 절대 위치로 별 아이콘 버튼 배치:
- `lucide-react`의 `Star` 아이콘 사용.
- 활성: `fill="currentColor"` + 따뜻한 강조색(예: `text-yellow-300` 또는 디자인 토큰 기반 amber 톤) + soft shadow.
- 비활성: 흰색 외곽선, 반투명 배경 (`bg-black/30 backdrop-blur-sm`)으로 사진 위에서도 보이게.
- 크기: `h-8 w-8 rounded-full`, 아이콘 `size={16}`.
- `onClick`에서 `e.preventDefault()` + `e.stopPropagation()`으로 `<Link>` 네비게이션 방지.
- 핸들러: `await updateAlbum(a.id, { favorite: !a.favorite })` — `notifyAlbums()`가 자동 호출되어 리스트 즉시 갱신.
- 접근성: `aria-pressed={!!a.favorite}`, `aria-label={t.favorite}` / `t.unfavorite`.

### 정렬 로직 수정
현재 `sortedAlbums` 계산식은 그대로 두고, 그 위에 **즐겨찾기 우선 분리**를 한 단계 더 적용:

```ts
const sortedAlbums = albums
  ? [...albums].sort((a, b) => {
      // 1순위: favorite 여부 (true가 위로)
      const fa = a.favorite ? 1 : 0;
      const fb = b.favorite ? 1 : 0;
      if (fa !== fb) return fb - fa;
      // 2순위: 기존 sortMode/sortDir 로직
      let diff = sortMode === "photo"
        ? (parsePeriodDate(b.period) || b.createdAt) - (parsePeriodDate(a.period) || a.createdAt)
        : b.createdAt - a.createdAt;
      return sortDir === "desc" ? diff : -diff;
    })
  : null;
```
- 검색/태그 필터(`visibleAlbums`) 로직은 변경 없음 — 필터링 후에도 즐겨찾기가 상단에 유지됨.

## 3. i18n (`src/lib/i18n.ts`)

추가 키:
- `favorite`: "즐겨찾기 추가" / "Add to favorites"
- `unfavorite`: "즐겨찾기 해제" / "Remove from favorites"

## 변경 없음
- 앨범 상세 페이지, 생성 플로우, 백엔드/DB, 디자인 토큰, 정렬 드롭다운 UI.
- 즐겨찾기는 정렬 모드(`created`/`photo`)와 독립적으로 동작 — 즐겨찾기 그룹 내부에서 현재 정렬 모드가 적용됨.

## 검증
- TypeScript 컴파일 통과.
- 별표 클릭 시 카드가 즉시 상단으로 이동하는지 프리뷰에서 확인.
- 별표 클릭이 앨범 상세로의 네비게이션을 트리거하지 않는지 확인.
