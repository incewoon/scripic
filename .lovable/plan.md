## 목표

이전 프롬프트에서 제안한 세 가지 테마(**Timeless Script**, **Pure Minimal**, **Elegant Storyteller**)를 설정 화면 테마 선택기에서 바로 고를 수 있게 반영하고, **Timeless Script를 앱 기본 테마**로 지정합니다. 기존 3개 테마(warm / midnight / linen)는 새 세트로 교체합니다.

## 새 테마 구성

| ID | 표시명 (KO / EN) | 무드 | 핵심 톤 |
|---|---|---|---|
| `timeless` ⭐기본 | 타임리스 스크립트 / Timeless Script | 시네마틱한 기억의 금고 | 잉크 블랙 + 크림 페이퍼 + 골드, Cormorant Garamond + Inter |
| `minimal` | 퓨어 미니멀 / Pure Minimal | 가장 조용한 한 장의 문서 | 트루 화이트/블랙, Inter Tight + JetBrains Mono, 그림자 없음 |
| `storyteller` | 엘레강트 스토리텔러 / Elegant Storyteller | 가죽 장정 문학책의 따뜻함 | 에스프레소 + 번트 시에나 + 카퍼, Libre Caslon Text + Lora, 페이퍼 그레인 |

각 테마는 라이트 + `@media (prefers-color-scheme: dark)` 다크 변형 두 모드를 모두 정의합니다.

## 변경할 파일

1. **`src/styles.css`**
   - 기존 `[data-theme="warm" | "midnight" | "linen"]` 블록 제거
   - **`:root`(=기본값)에 `timeless` 라이트 토큰**을 그대로 정의 → 어떤 `data-theme`도 없는 첫 진입에서도 Timeless가 보이도록 보장
   - `[data-theme="timeless"]` / `[data-theme="minimal"]` / `[data-theme="storyteller"]` 블록 추가 (각각 라이트 + 다크 미디어쿼리)
   - `--font-display`를 테마별로 오버라이드 (`Cormorant Garamond` / `Inter Tight` / `Libre Caslon Text`)
   - 필요한 Google Fonts `@import` 상단 추가 (Cormorant Garamond, Inter Tight, JetBrains Mono, Libre Caslon Text, Lora)
   - `--radius`, `--shadow-*`, `--gradient-page` 등 토큰을 테마 가이드대로 (Minimal은 그림자 0, Storyteller는 페이퍼 그레인 배경 이미지)

2. **`src/lib/theme.ts`**
   - `Theme` 타입을 `"timeless" | "minimal" | "storyteller"`로 교체
   - `THEMES` 배열 갱신
   - **기본값: `"timeless"`** (`getTheme` 폴백, `applyThemeOnBoot` 모두)
   - 저장 키 `moara_theme_v1` 유지하되, 저장된 값이 새 ID 집합에 없으면(=구버전 `warm`/`midnight`/`linen`) 자동으로 `timeless`로 마이그레이션해서 다시 저장

3. **`src/lib/i18n.ts`**
   - `themeWarm/themeMidnight/themeLinen`(+Desc) 키를 다음으로 교체 (EN/KO 모두):
     - `themeTimeless`, `themeTimelessDesc`
     - `themeMinimal`, `themeMinimalDesc`
     - `themeStoryteller`, `themeStorytellerDesc`

4. **`src/routes/settings.tsx`**
   - `THEME_PREVIEWS` 키를 새 3개로 교체 (각 테마 배경 그라데이션 + 대표 스와치 3개)
   - 매핑 분기(`id === "warm"`…) 부분도 새 ID로 교체
   - 목록 순서: **Timeless → Minimal → Storyteller** (기본을 첫 번째로 노출)

## 손대지 않는 것

- 백업/저장소/개인정보 섹션, 카피라이트 이스터에그 등 그 외 설정 UI
- `data-theme` 동작 방식(루트 `<html>`에 부착), 이벤트명, 저장 키 이름
- Tailwind / shadcn 구조, 라우팅, 비즈니스 로직

## 검증

- 첫 진입(저장값 없음) → Timeless 라이트가 즉시 적용됨
- 설정에서 세 테마를 차례로 선택 → 홈/생성/앨범/설정 모든 화면이 즉시 새 팔레트·타이포로 전환
- 시스템 다크 모드 토글 시 같은 테마 ID 안에서 다크 변형으로 부드럽게 전환
- 기존 저장값(`warm`/`midnight`/`linen`) 가진 사용자는 크래시 없이 `timeless`로 마이그레이션
- `grep -ri '"warm"\|"midnight"\|"linen"' src` 0건
