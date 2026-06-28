## 문제
Capacitor 빌드에서 WebView가 상태바·네비게이션바 영역까지 풀스크린으로 깔리면서, 페이지 상단의 백버튼/카운터, 하단의 CTA 버튼이 시스템 UI에 가려짐. 웹브라우저에서는 Chrome 자체 chrome이 inset을 만들어줘서 문제가 없었음.

## 해결 방향
Capacitor 공식 권장대로 **safe-area inset CSS 변수**를 전역으로 적용. 두 가지를 함께 처리:

1. **WebView가 safe area를 인식하도록 설정**
   - `capacitor.config.ts`: `android.adjustMarginsForEdgeToEdge: "auto"` 추가 (Capacitor 7+ 표준), 또는 `@capacitor-community/safe-area` 플러그인 사용
   - `MainActivity.java`에서 `WindowCompat.setDecorFitsSystemWindows(window, false)` + status bar/nav bar 투명 처리 → `env(safe-area-inset-*)` 값이 채워짐
   - `<meta name="viewport" content="viewport-fit=cover">` 확인 (TanStack `__root.tsx` head)

2. **앱 전역에 safe-area padding 적용**
   - `src/styles.css`의 `body`(또는 루트 `#app` 컨테이너)에:
     ```css
     padding-top: env(safe-area-inset-top);
     padding-bottom: env(safe-area-inset-bottom);
     padding-left: env(safe-area-inset-left);
     padding-right: env(safe-area-inset-right);
     ```
   - 모든 페이지(`index.tsx`, `create.tsx`, `album.$id.tsx`, `chat.tsx`, `settings.tsx`, `easter.tsx`)에 별도 수정 없이 일괄 적용됨
   - **하단 고정 CTA 버튼**(`create.tsx`의 "사진을 한 장 이상 골라주세요", `index.tsx`의 "새 이야기 만들기", `album.$id.tsx`의 이미지로 저장)은 `position: sticky/fixed`라면 별도로 `padding-bottom: env(safe-area-inset-bottom)` 또는 `bottom: env(safe-area-inset-bottom)` 추가 필요 — 확인 후 처리

3. **웹앱은 영향 없음**
   - 브라우저에서는 `env(safe-area-inset-*)`가 0이므로 기존 레이아웃 그대로

## 변경 파일
- `capacitor.config.ts` — edge-to-edge 옵션 추가
- `android/app/src/main/java/app/lovable/aialbum/MainActivity.java` — 시스템 바 투명/inset 활성화
- `src/styles.css` — 전역 safe-area padding
- `src/routes/__root.tsx` — viewport meta에 `viewport-fit=cover` 확인/추가
- `src/routes/index.tsx`, `src/routes/create.tsx`, `src/routes/album.$id.tsx` — 하단 고정 버튼이 있을 경우 bottom inset 보정

## 확인 사항
- Capacitor 버전(7+ 인지) 확인 후 `adjustMarginsForEdgeToEdge` vs `@capacitor-community/safe-area` 중 선택
- 다음 빌드는 `bun run build:capacitor && npx cap sync android` 후 Android Studio에서 재빌드 필요(코드 변경만으로는 APK 갱신 안 됨)
