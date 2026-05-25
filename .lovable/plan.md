
## 원인

React error #418 = "hydration text mismatch". 원인은 `/chat` 라우트가 SSR에서는 `sessionStorage`에 접근할 수 없어 폴백 값("creative", "politely", 빈 photos)으로 렌더되고, 클라이언트 hydration 시점에는 실제 sessionStorage 값으로 렌더되면서 DOM 텍스트가 달라지기 때문입니다. 추가로 `callGeminiProxy`가 Firebase Auth가 준비되기 전에 호출되며 `setTimeout(300ms)` 으로 회피하고 있어 안정적이지 않습니다.

## 변경 계획

### 1. `src/routes/chat.tsx` — SSR 비활성화
- `createFileRoute("/chat")` 옵션에 `ssr: false` 추가.
- 채팅 화면은 100% 브라우저 상태(sessionStorage, visualViewport, history) 기반이므로 SSR이 의미가 없고, 비활성화하는 것이 hydration mismatch의 정공법.
- `useState` 초기화에서 sessionStorage를 읽는 코드는 그대로 둬도 안전(클라이언트에서만 실행됨).

### 2. `src/routes/create.tsx`, `src/routes/album.$id.tsx` — 동일 패턴 확인 후 `ssr: false`
- 두 라우트 모두 sessionStorage / IndexedDB 기반의 클라이언트 전용 화면. 같은 hydration 위험이 있으므로 동일하게 `ssr: false` 적용.
- index, settings 등 콘텐츠형 라우트는 그대로 유지(SSR 유지).

### 3. `src/lib/useAuthReady.ts` — Firebase Auth 준비 훅 신설
- `onAuthStateChanged`로 첫 콜백이 올 때까지 `ready=false`, 이후 `ready=true` + `user`를 노출.
- `setTimeout(300)` 같은 임의 대기 대신 명시적인 ready gate를 제공.

### 4. `src/lib/gemini.ts` — 대기 로직 교체
- 모듈 내부에서 `getAuth(...).authStateReady()` (없으면 `onAuthStateChanged` 1회 await)로 첫 auth 상태가 결정될 때까지 기다린 뒤 `currentUser`를 확인.
- `setTimeout(300)` 제거.

### 5. `src/routes/chat.tsx` — auth gate
- 컴포넌트 상단에서 `useAuthReady()` 사용.
- `ready`가 `false`인 동안에는 첫 자동 send(`useEffect` 내 `void send(opener, ...)`)를 트리거하지 않음(가드 추가).
- `ready && user`가 모두 true가 된 뒤에만 초기 send 실행 → callGeminiProxy 호출 시 항상 ID 토큰을 안정적으로 획득.

## 검증
- `/chat` 진입 시 콘솔에 React #418 미발생 확인.
- 채팅 첫 메시지가 자동으로 전송되고 gemini-proxy 응답이 정상 수신되는지 확인.
- 새로고침/딥링크에서도 동일 동작.

## 영향 범위
- 페이지 라우트 3개에 `ssr: false` 추가.
- 새 훅 1개, gemini.ts 짧은 로직 교체.
- 다른 SSR/SEO 페이지(index, settings 등)는 변경 없음.
