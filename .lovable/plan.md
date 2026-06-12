## 목표
앨범에 사용자 태그(여행, 가족, 일상…)를 붙이고, 메인화면에서 태그 칩으로 OR 필터링.

## 변경 사항

### 1. `src/lib/storage.ts`
- `Album` 타입에 `tags?: string[]` 추가 (옵션, 기존 앨범 호환).
- 별도 마이그레이션 불필요 (IndexedDB, 옵셔널 필드).

### 2. `src/lib/i18n.ts`
- 프리셋 태그 5–6개 i18n 키 추가: 여행/가족/일상/친구/음식/특별한날 (Travel/Family/Daily/Friends/Food/Special).
- 라벨: `tagsLabel`, `tagsHint`, `tagAddPlaceholder`, `filterByTag` 등.

### 3. `src/routes/create.tsx` (사진 선택 단계에서 입력)
- 새 상태: `tags: string[]`.
- 프리셋 칩 (토글) + 자유 입력 input (Enter/콤마로 추가, X로 삭제, 최대 5개 정도).
- 위치: 모드/톤 섹션 아래, 진행바 위.
- `sessionStorage.setItem("memori_tags", JSON.stringify(tags))` 저장.

### 4. `src/routes/chat.tsx`
- 시작 시 `sessionStorage`에서 tags 읽어 상태로 보관.
- `saveAlbum({ ..., tags })`로 함께 저장.

### 5. `src/routes/index.tsx` (필터 UI + 로직)
- URL search 스키마에 `tags: string[]` 추가 (`validateSearch`).
- 모든 앨범에서 사용된 태그 목록 집계 (정렬: 빈도수 내림차순).
- 검색창 바로 아래 가로 스크롤 칩 영역:
  - 각 칩 탭 → URL `tags` 토글 (replace navigate).
  - 선택된 칩 강조 (gradient-warm 배경).
  - 1개 이상 선택 시 "모두 지우기" X 표시.
- `visibleAlbums` 필터링: 기존 `tokens` 매칭 + `tags.length === 0 || a.tags?.some(t => selectedTags.includes(t))` (OR).
- 앨범 카드 `<Link>`의 `search`에 `tags`도 함께 전달해 album 페이지 이동 후 복귀 시 필터 유지.
- 카운트 표시도 태그 필터 적용분 반영.

### 6. `src/routes/album.$id.tsx`
- `validateSearch`에 `tags: string[]` 추가, 뒤로가기 `<Link to="/" search={{ q, tags }}>` 로 보존.
- (선택) 상세 헤더에 앨범 태그 배지 표시 — 읽기 전용. 작은 추가만.

## 기술 세부

### 태그 정규화
- 입력값: trim, 길이 1–20, 중복 제거(대소문자 무시 기준 케이스 보존). 빈 문자열·공백만은 무시.
- 정렬: 사용자 추가 순서 유지.

### URL 직렬화
- TanStack Router 기본 직렬화가 배열을 지원 — `tags=여행&tags=가족` 형태.
- `validateSearch`에서 `Array.isArray(s.tags) ? s.tags.filter(t => typeof t === 'string') : []`.

### 네이티브 호환
- Capacitor WebView도 동일한 URL 검색 파라미터 작동, 별도 처리 불필요.

## 비변경 영역
- 백엔드/DB 스키마 변경 없음 (로컬 IndexedDB).
- 검색 한글 IME 처리 로직(기존 inputValue/composition) 그대로.
- 디자인 토큰(컬러/그라데이션) 기존 변수 재사용.
