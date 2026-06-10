# 앨범 검색 기능

홈 화면(`src/routes/index.tsx`)에 키워드 검색바를 추가해서, 디바이스(IndexedDB)에 저장된 앨범을 실시간으로 필터링합니다.

## 검색 대상 필드
`Album` 타입(`src/lib/storage.ts`)의 텍스트 필드 전부:
- `title`, `subtitle`, `intro`, `closing`
- `period`, `location`
- `photos[].caption`

대소문자 무시, 한글/영문 부분일치(`String.includes`). 공백으로 구분된 여러 단어는 AND 매칭(모든 토큰이 어디든 등장해야 일치).

## UI

정렬 컨트롤(`ArrowUpDown`, 방향 토글) 줄 **위쪽**에, `Search` 아이콘이 들어간 입력창을 한 줄로 배치:

```text
[🔍  앨범 검색...                              ✕]
[정렬: 만든 날짜 ▾]  [↓]  [⚙]
```

- placeholder: i18n 키 `searchPlaceholder` ("앨범 검색..." / "Search albums...")
- 입력값이 있을 때만 우측에 `X` 클리어 버튼 노출
- 입력값은 컴포넌트 state만 사용(세션/로컬 저장 안 함 — 새로 들어올 때 빈 상태가 자연스러움)
- 스타일은 기존 `border-border/60 bg-card/80 shadow-[var(--shadow-soft)]` 톤에 맞춤, 둥근 pill 형태

## 동작

1. 기존 정렬 로직 적용한 `sortedAlbums`에 검색 필터를 추가 적용 → `visibleAlbums`.
2. 검색어가 비어있으면 필터 패스(현재 동작 그대로).
3. 검색 결과 0건일 때: 빈 상태 폴라로이드(첫 앨범 만들기 카드) 대신, "검색 결과가 없어요 / No results" 라는 가벼운 placeholder 카드를 보여주고 + 버튼은 그대로 유지.
4. 헤더의 앨범 개수 카운트는 **필터된 개수 / 전체 개수** 형태(예: `3 / 12`)로 표시해, 검색 중임을 알 수 있게 함. 검색어 없으면 기존처럼 전체 개수만.

## i18n
`src/lib/i18n.ts`에 키 두 개 추가:
- `searchPlaceholder`: "앨범 검색..." / "Search albums..."
- `searchNoResults`: "검색 결과가 없어요" / "No albums match your search"

## 변경 파일
- `src/routes/index.tsx` — 검색 state, 입력 UI, 필터 로직, 결과 0건 처리, 카운트 표시.
- `src/lib/i18n.ts` — 신규 문구 2개(ko/en).

## 변경하지 않는 것
- `Album` 데이터 모델, 저장소(IndexedDB) 스키마
- 정렬 로직, 일일 제한, 후기 보상 등 다른 기능
- 다른 라우트(앨범 상세, 채팅 등)
