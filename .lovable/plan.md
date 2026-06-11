# 검색어 유지 + 앨범 상세 하이라이트

현재 `Hl` 컴포넌트는 홈 카드에만 적용되어 있고, 검색어는 컴포넌트 state라 앨범을 열고 뒤로 가면 사라집니다. URL 쿼리 파라미터(`?q=...`)로 옮겨서 두 라우트가 공유하고, 브라우저 뒤로 가기에도 자연스럽게 남도록 합니다.

## 동작 흐름

1. 홈에서 검색 → URL이 `/?q=여행` 으로 갱신 (입력 시 `navigate({ search })` replace).
2. 카드를 탭하면 `Link`가 `to="/album/$id" search={{ q }}` 로 이동 → `/album/abc?q=여행`.
3. 앨범 상세에서 `q` 를 읽어, 제목/부제/기간/장소/intro/closing/각 캡션 텍스트에 동일한 `<Hl>` 마크 적용.
4. 뒤로 가기 시 URL이 `/?q=여행` 으로 복원되므로 홈의 검색 입력값도 다시 채워져 필터링 상태 유지. 다음 앨범을 순차적으로 열어볼 수 있음.

## 변경 파일

### `src/routes/index.tsx`
- `Route` 에 `validateSearch: (s) => ({ q: typeof s.q === 'string' ? s.q : '' })` 추가.
- `query` state 대신 `Route.useSearch().q` 를 사용하고, 입력 onChange 에서 `navigate({ search: { q: v }, replace: true })`.
- 카드 `<Link to="/album/$id" params={{ id: a.id }} search={{ q }}>` 로 변경 (현재 q를 넘김).
- `Hl` 컴포넌트를 공용 모듈로 분리(아래 참고).

### `src/lib/highlight.tsx` (신규)
- `escapeRegExp`, `Hl({ text, query })` 를 export. `query` 문자열을 받아 내부에서 토큰화. index/album 양쪽에서 import.

### `src/routes/album.$id.tsx`
- `Route` 에 동일한 `validateSearch` 추가.
- `const { q } = Route.useSearch()` 로 검색어 획득.
- 읽기 모드(`!editingMode`)일 때 `EditableText` 가 텍스트 대신 `<Hl text={value} query={q} />` 를 렌더하도록 `query` prop 추가, 또는 더 간단히 표시 부분을 `<Hl>` 로 감싸기.
  - 편집 모드일 때는 입력 충돌 방지 위해 하이라이트 미적용.
- 헤더 뒤로가기 `<Link to="/">` 에는 별도 search 전달 불필요 — 브라우저 history 가 이전 URL(`/?q=...`)을 그대로 복원.

## 변경하지 않는 것
- 저장소(IndexedDB), 정렬, 일일 제한, i18n 키.
- 검색 필터 로직 자체(홈의 `visibleAlbums` 계산).
- 앨범 데이터 모델.

## 기술 메모
- TanStack Router 의 `validateSearch` 로 타입 안전한 `?q=` 처리. `replace: true` 로 매 키 입력마다 history 가 쌓이지 않게 함.
- `Hl` 은 편집 input 안에서는 사용 안 함 (textarea/input 내부 마크업 불가).
- 빈 `q` 일 때 `Hl` 은 원문 그대로 반환 — 기존 표시와 동일.
