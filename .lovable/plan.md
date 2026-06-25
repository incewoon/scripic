# Scripic 홈 화면 브랜드 강화 계획

## 목표
홈 화면 상단을 "삶의 아카이브/기록장" 느낌으로 강화. 로고 아래 고정 슬로건 + 그 아래 랜덤 Epigraph 한 줄 추가.

## 변경 위치
`src/routes/index.tsx`의 `<header>` 영역만 수정. 검색/정렬/리스트/CTA는 그대로 둠.

## 1. 문장 데이터 파일 신규 생성
`src/lib/epigraphs.ts`
- `EPIGRAPHS_KO: string[]` (50문장), `EPIGRAPHS_EN: string[]` (50문장) — 사용자가 제공한 문장 그대로.
- `pickEpigraph(lang: "ko" | "en"): string` — `sessionStorage`에 직전 인덱스를 저장해 연속 중복 방지하고 랜덤 1개 반환.

## 2. i18n에 고정 슬로건 추가
`src/lib/i18n.ts`에 `brandSloganLine1`, `brandSloganLine2` 키 추가:
- KO: "사진은 순간을 담고," / "Scripic은 이야기를 남깁니다."
- EN: "Photos capture moments." / "Scripic preserves the stories behind them."

## 3. 홈 헤더 리디자인 (`src/routes/index.tsx`)
현재:
```
<h1>Scripic</h1>
<p>{t.appTagline}</p>
```
변경 후 구조:
```
<h1>Scripic</h1>                          ← 유지
<p class="brand-slogan">                  ← 신규: 고정 슬로건, 2줄, 중앙정렬
  사진은 순간을 담고,
  Scripic은 이야기를 남깁니다.
</p>
<p class="epigraph">                      ← 신규: 랜덤 Epigraph
  "사진에 담기지 않은 기억까지."
</p>
```
- 기존 `appTagline`(p) 제거.
- 슬로건: 다크 그레이(#374151~#4B5563 레벨), Medium weight, 로고보다 작고 본문보다 약간 큼(약 14~15px), `leading-relaxed`.
- Epigraph:
  - 따옴표(") 포함, `italic`, 회색(#6B7280), 약 13px, 중앙정렬
  - 카드/배경/테두리 없음, 위아래 충분한 여백(예: `mt-5 mb-2`)
  - 진입 시/언어 변경 시 한 번 랜덤 선택, 500~800ms fade-in (`animate-fade-in` 또는 CSS opacity transition)
  - 언어별 단일 표시 (현재 `useT()`의 `lang`으로 분기)

## 4. 동작 로직
- `useState`로 현재 epigraph 보관, `useEffect([lang])`에서 `pickEpigraph(lang)` 호출.
- 같은 문장 연속 방지: `sessionStorage["scripic_last_epigraph_idx_<lang>"]`와 다른 인덱스가 나올 때까지 재추첨(최대 몇 회).
- Fade: key 변경 시 `animate-fade-in` 재실행되도록 `key={epigraph}` 적용.

## 영향 범위
- 추가/수정: `src/lib/epigraphs.ts`(신규), `src/lib/i18n.ts`(슬로건 키), `src/routes/index.tsx`(header만).
- 다른 화면(create/chat/album/settings) 영향 없음.
- 기존 `t.appTagline`은 다른 곳에서 사용되지 않으면 제거, 사용 중이면 유지하고 홈에서만 미표시.

## 비목표
- 로고/검색바/정렬/앨범 카드/CTA/푸터 다이얼로그 등은 변경하지 않음.
- 색상 토큰 체계 변경 없음 (필요 시 인라인 색상 또는 기존 `warm-muted` 활용).
