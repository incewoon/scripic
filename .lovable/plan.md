# 테마 선택 기능 추가 — Warm · Midnight Ink · Linen Paper

## 무엇을 만들까

설정 화면에서 3가지 테마 중 하나를 선택할 수 있게 하고, 선택한 테마가 앱 전체에 즉시 반영 + 다음 실행에도 유지되게 합니다.

| 테마 | 분위기 | 영감 |
|---|---|---|
| **Warm** (현재 기본) | 따뜻한 베이지 + 코럴/로즈 | Apple Photos · Day One |
| **Midnight Ink** | 깊은 네이비 + 따뜻한 골드 포인트 | Things 3 · Bear (다크) |
| **Linen Paper** | 종이 질감의 따뜻한 화이트 + 잉크 블루 | Notion · iA Writer |

다크 모드 자동 전환은 사용자가 "테마만 선택"으로 답해주셔서 넣지 않습니다. (Midnight 테마 자체가 다크 역할)

## 구현 방식 (기술 섹션)

### 1) `src/styles.css` 재구성
현재 `:root`에만 있는 토큰을 **3개 테마 블록**으로 분리:

```text
:root, [data-theme="warm"]   { ...현재 값 그대로... }
[data-theme="midnight"]      { 네이비 + 골드 팔레트 }
[data-theme="linen"]         { 화이트 + 잉크 블루 팔레트 }
```

각 블록은 동일한 토큰 셋을 정의합니다:
- 기본: `--background --foreground --card --primary --secondary --muted --accent --border --input --ring --destructive`
- 팔레트: `--blush --peach --cream --lavender --mint`
- **새 토큰**: `--warm-text --warm-muted` (현재 하드코딩된 oklch 값을 토큰화 → 테마 따라 자동 변경)
- 그라디언트/섀도우: `--gradient-soft --gradient-warm --gradient-sunset --gradient-page --shadow-soft --shadow-card --shadow-warm`

`body` 배경은 새 토큰 `--gradient-page`로 바꿔서 테마별로 페이지 배경 톤이 달라지게 합니다.

`.warm-text` / `.warm-muted` 유틸리티는 토큰을 참조하도록 변경 → 모든 화면 자동 적응 (코드 수정 불필요).

### 2) `src/lib/theme.ts` (신규)
- `Theme = "warm" | "midnight" | "linen"`
- `getTheme()`: localStorage `moara_theme_v1` 읽기, 없으면 `"warm"`
- `setTheme(t)`: localStorage 저장 + `document.documentElement.dataset.theme = t` + custom event 발행
- `useTheme()` 훅: 현재 테마 상태 + setter 제공, 다른 탭/컴포넌트 변경에도 동기화
- `applyThemeOnBoot()`: SSR hydration 전 `<html>`에 즉시 적용 (FOUC 방지)

### 3) `src/routes/__root.tsx`
`RootComponent`의 `useEffect` 안에서 `applyThemeOnBoot()` 호출 → 첫 페인트 직후 저장된 테마 적용.

### 4) `src/routes/settings.tsx` — 테마 섹션 추가
Account 섹션 아래에 새 카드 추가:

```text
[🎨] Theme
   ┌─────────┐ ┌─────────┐ ┌─────────┐
   │  Warm   │ │Midnight │ │  Linen  │
   │ (현재)  │ │  Ink    │ │ Paper   │
   └─────────┘ └─────────┘ └─────────┘
```

각 카드:
- 작은 컬러 스와치 미리보기 (배경/카드/프라이머리 3색 동그라미)
- 테마명 + 한 줄 설명
- 선택된 테마는 `ring-2 ring-primary` 표시
- 클릭 시 즉시 적용 + 토스트 "테마가 변경되었어요"

### 5) `src/lib/i18n.ts` 키 추가
- `themeSection` / `themeWarm` / `themeMidnight` / `themeLinen`
- 각 테마 짧은 설명 (`themeWarmDesc` 등)
- `themeChanged` 토스트 문구
- 한국어/영어 둘 다

## 영향 범위

- 모든 화면(Album, Chat, Create, Auth, Easter, Index, Settings, Paywall, 다이얼로그)은 이미 토큰(`--primary`, `--card`, `--gradient-warm` 등) + `.warm-text`/`.warm-muted` 유틸을 사용 중이므로 **컴포넌트 수정 불필요**, 자동으로 새 테마에 반응합니다.
- 사용자별 백업/데이터/Supabase 스키마 변경 없음 (테마는 클라이언트 localStorage 전용).

## 변경 파일

- `src/styles.css` (수정 — 토큰 재구성)
- `src/lib/theme.ts` (신규)
- `src/lib/i18n.ts` (수정 — 키 추가)
- `src/routes/__root.tsx` (수정 — 부팅 시 테마 적용)
- `src/routes/settings.tsx` (수정 — 테마 선택 카드 추가)
