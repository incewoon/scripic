## 문제 진단

어제 작업에서 `body`에 `padding-top/bottom: env(safe-area-inset-*)`를 일괄 적용했지만, 이 방식이 두 가지 부작용을 만들고 있습니다.

1. **하단 버튼이 네비게이션 바와 겹침 (chat, create)**
   - `chat.tsx`, `create.tsx`의 루트 컨테이너가 `h-[100dvh]`. 100dvh는 시스템 바 영역을 포함한 풀 뷰포트 높이입니다.
   - `body`에 `padding-bottom: env(safe-area-inset-bottom)`이 더해지면서, 컨테이너 전체가 위로 밀려나는 게 아니라, **컨테이너 내부의 하단 입력바/CTA가 가시 영역 밖(네비게이션 바 뒤)으로 밀려나** 결과적으로 겹쳐 보입니다.
   - 두 화면의 하단 바는 이미 자체적으로 `pb-[max(env(safe-area-inset-bottom), …)]`를 가지고 있어서 — body padding과 이중으로 적용되는 게 진짜 원인.

2. **메인 외 화면에서 위로 스와이프 시 하단에 빈 공간**
   - `album.$id.tsx`, `settings.tsx`, `easter.tsx` 등은 `min-h-screen`(또는 일반 흐름) 구조.
   - `body` 하단 padding이 콘텐츠 끝에 빈 영역으로 더해져, 스크롤 끝에 “많은 공간”으로 보임.
   - 메인은 `fixed` CTA가 자기 위치를 `bottom-[calc(1.5rem+env(...))]`로 잡고 있어서 영향이 없는 것처럼 보임.

## 해결 방향

`body`의 상하 inset을 **제거**하고, inset이 정말 필요한 지점에만 명시적으로 적용합니다(좌우 inset은 안전하니 유지).

### 변경 사항

1. **`src/styles.css`**
   - `body`에서 `padding-top: env(safe-area-inset-top)`, `padding-bottom: env(safe-area-inset-bottom)` 제거.
   - `padding-left/right: env(safe-area-inset-left/right)`만 유지 (가로 노치 대응).

2. **상단 inset — 각 라우트 헤더 영역에 적용**
   - `src/routes/index.tsx`: 루트 컨테이너 `pt-12` → `pt-[calc(3rem+env(safe-area-inset-top))]`.
   - `src/routes/create.tsx`: 첫 헤더 블록(`px-5 pt-6` 부근)에 `pt-[calc(1.5rem+env(safe-area-inset-top))]`.
   - `src/routes/chat.tsx`: sticky 헤더(`px-5 pt-6`)에 `pt-[calc(1.5rem+env(safe-area-inset-top))]`.
   - `src/routes/album.$id.tsx`: sticky 헤더(`px-5 py-3`)에 `pt-[calc(0.75rem+env(safe-area-inset-top))]`.
   - `src/routes/settings.tsx`, `src/routes/easter.tsx`도 같은 패턴으로 헤더에 top inset 추가.

3. **하단 inset — 이미 처리된 것 + 누락분만 보강**
   - `chat.tsx`, `create.tsx`의 하단 입력/CTA 바는 기존 `pb-[max(env(safe-area-inset-bottom), …)]` 유지 (이제 body 중복 없음).
   - `album.$id.tsx`의 하단 “이미지로 저장” 버튼 래퍼(`px-6 mt-6`)에 `pb-[calc(1.5rem+env(safe-area-inset-bottom))]` 추가.
   - 그 외 `min-h-screen` 화면(`settings.tsx`, `easter.tsx`)의 최하단 컨테이너 또는 푸터에 `pb-[env(safe-area-inset-bottom)]`만 추가.

4. **`h-[100dvh]` 컨테이너 보정 (chat, create)**
   - body padding이 제거되므로, `h-[100dvh]`는 그대로 풀 뷰포트를 차지하고, 내부 하단 바의 자체 inset이 정확히 네비게이션 바 위에 정렬됩니다. 별도 수정 없음.

### 확인
- 웹에서는 `env(safe-area-inset-*)`가 0이라 시각 변화 없음.
- Capacitor 빌드는 `bun run build:capacitor && npx cap sync android` 후 Android Studio 재빌드 필요.
- 확인 포인트: ① chat/create 하단 버튼이 네비게이션 바 바로 위에 정확히 안착, ② album/settings 등에서 스크롤 끝에 빈 공간 없음, ③ 모든 화면 상단 헤더/버튼이 상태바에 가려지지 않음.
