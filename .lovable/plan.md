## 목표
앨범 상세 수정모드에서 (1) 저장된 장소를 삭제할 수 있게, (2) 기간(날짜)을 텍스트 대신 달력에서 선택할 수 있게 개선.

## 1. 장소 삭제 기능 (`src/routes/album.$id.tsx`)

- 수정모드(`editMode`)일 때, 장소 칩(`locationChipRef` 버튼) 옆에 작은 `X` 삭제 버튼을 추가.
  - 조건: `album.location` 또는 `album.lat/lng` 중 하나라도 있을 때만 표시.
  - 클릭 시 `patch({ location: "", lat: undefined, lng: undefined })` 실행 후 `toast.success(t.deleted)`.
  - 삭제 후에는 자동으로 "+ 장소 추가" 버튼 UI로 전환됨(기존 조건부 렌더링 재사용).
- 태그 삭제와 동일한 시각적 패턴(작은 `X` 아이콘) 사용.
- i18n: 필요 시 `t.removeLocation` 정도의 aria-label 키 추가(`src/lib/i18n.ts`).

## 2. 기간 달력 선택 기능

앨범의 `period` 필드는 현재 단일 날짜 또는 범위(`2024.01.01~05`, `2024.01.01~2024.02.03`) 형식의 문자열. 수정모드에서 이 값을 date range picker로 편집.

### 접근

- 기존 `EditableText` 대신, `period` 항목에 한해 별도 컴포넌트/브랜치로 처리.
- 수정모드에서 기간 텍스트/연필 아이콘을 클릭하면 shadcn `Popover` + `Calendar (mode="range")` 팝오버가 열림.
- 범위 선택 후 "저장" 클릭 시 문자열로 포맷팅하여 `patch({ period })`:
  - 같은 날: `YYYY.MM.DD`
  - 같은 월: `YYYY.MM.DD~DD`
  - 그 외: `YYYY.MM.DD~YYYY.MM.DD`
  - (기존 `summarizePeriod` 로직과 동일 규칙; 헬퍼로 추출해 공유)
- "지우기" 버튼으로 `period`를 빈 값으로 초기화 가능.
- 읽기모드에서는 지금처럼 텍스트만 표시.

### 기존 문자열 파싱

- 팝오버 초기값은 저장된 `period` 문자열을 파싱해서 range로 복원 시도.
- 파싱 실패(수동으로 이상하게 입력된 경우 등) → 빈 상태로 시작.

### 기술 세부

- `src/components/ui/calendar.tsx`, `popover.tsx` 이미 존재하므로 신규 라이브러리 설치 없음.
- 달력 wrapper에 `pointer-events-auto` 클래스 필수 적용.
- `date-fns`는 이미 프로젝트에 포함(shadcn Calendar 의존성).

## 변경 파일 요약

- `src/routes/album.$id.tsx`
  - 장소 칩 옆 삭제 X 버튼 추가 (수정모드 한정).
  - period 편집을 date range picker Popover로 교체.
  - 문자열 ↔ range 변환 헬퍼 추가(파일 내부 또는 `src/lib/photoMeta.ts` 공용화).
- `src/lib/i18n.ts` (선택)
  - `removeLocation`, `pickPeriod` 등 라벨 추가(ko/en/ja/zh 등 프로젝트에 있는 언어들에 맞춰).

## 비변경

- 저장 스키마(`Album` 타입)는 그대로 유지 — 여전히 `period: string`.
- 다른 필드(제목/부제/본문 등)의 편집 UX는 변경 없음.
