## 목표
`/chat`에서 Firebase Auth가 안정적으로 초기화된 뒤에만 AI 호출이 시작되도록 다시 설계합니다. 익명 사용자 기반 식별을 유지해 무료 정책(하루 1개 앨범, 추천 보상 추가 생성)과 이후 유료 계정 전환까지 자연스럽게 이어지게 만듭니다.

## 현재 문제
- `useAuthReady` 초기화 로그가 2번 찍히는 것은 개발 환경의 React Strict Mode 영향일 가능성이 큽니다.
- 하지만 지금 문제의 핵심은 단순 중복 로그가 아니라, `onAuthStateChanged → user: null` 이후 익명 로그인 시도가 안정적으로 이어지지 않는 점입니다.
- 현재 구조는 `useAuthReady`와 `gemini.ts`가 각각 별도로 Auth를 기다리고 있어, 초기화 타이밍이 분산되어 있습니다.
- repo snapshot 기준 `src/lib/useAuthReady.ts`는 cleanup/완료 처리와 중복 방지 로직이 불완전해 보이며, 이 상태면 `signInAnonymously`가 누락되거나 중복될 수 있습니다.
- 네트워크 로그에도 Firebase Identity Toolkit 요청이 없어서, 실제 익명 로그인 호출까지 도달하지 못하고 있을 가능성이 큽니다.

## 구현 계획
### 1) Firebase Auth를 싱글톤으로 재구성
- `src/integrations/firebase/client.ts`에서 앱만 초기화하는 현재 구조를 재검토합니다.
- 별도 auth 모듈을 두고 `initializeAuth` 또는 단일 `getAuth` 경로로 Auth 인스턴스를 한 번만 생성하도록 통합합니다.
- persistence를 명시해 새로고침/재진입 시 익명 사용자 세션이 안정적으로 복구되게 합니다.

### 2) 익명 로그인 플로우를 전역 단일 Promise로 직렬화
- `signInAnonymously`를 훅 내부에서 즉흥적으로 호출하지 않고, 공용 `ensureFirebaseUser()` 함수로 이동합니다.
- 이 함수는 다음 순서를 강제합니다:
  1. Auth 초기 상태 확정 대기
  2. 기존 사용자 있으면 재사용
  3. 없으면 익명 로그인 1회만 수행
  4. 이미 진행 중이면 같은 Promise 재사용
- 이렇게 하면 Strict Mode나 다중 렌더에서도 실제 익명 로그인 요청은 1번만 나갑니다.

### 3) `useAuthReady`를 얇은 구독 훅으로 재작성
- 훅은 직접 로그인 시도를 주도하지 않고, 공용 auth 준비 함수 결과를 기다린 뒤 상태만 반영하게 바꿉니다.
- `ready`, `user`, `error`를 명확히 분리합니다.
- `onAuthStateChanged` 구독은 cleanup을 확실히 넣고, 첫 상태 결정 전후 로그를 정리합니다.
- 개발 모드에서 effect가 2번 도는 것은 허용하되, 중복 인증 요청은 절대 발생하지 않도록 만듭니다.

### 4) `gemini.ts`는 독자적으로 Auth를 기다리지 않게 정리
- `src/lib/gemini.ts`의 별도 `onAuthStateChanged` 대기 로직을 제거하고, 공용 `ensureFirebaseUser()`를 사용하게 통합합니다.
- `callGeminiProxy()`는 항상 안정적인 사용자/토큰을 받은 뒤에만 실행되게 바꿉니다.
- 이렇게 하면 채팅 화면과 프록시 호출이 서로 다른 auth 타이밍에 의존하지 않게 됩니다.

### 5) `/chat`의 첫 AI 호출 조건을 더 엄격히 정리
- 현재처럼 `authReady && user` 가드만 두는 수준을 넘어서, 공용 auth 준비가 끝난 상태에서만 첫 `send()`가 실행되게 맞춥니다.
- 세션 스토리지 로드와 auth 준비를 분리하고, 둘 다 준비된 뒤 정확히 한 번만 자동 시작되도록 정리합니다.

### 6) 무료 정책/향후 유료화 기준에 맞는 식별 전략 정리
- 사용 목적을 고려하면, 브라우저/앱의 raw device id를 직접 쓰기보다 Firebase 익명 사용자 UID를 1차 식별자로 유지하는 쪽이 더 안전합니다.
- 필요하면 로컬 installation id를 보조 키로 두되, 서버 정책 기준은 Firebase UID 중심으로 맞춥니다.
- 이 구조는 이후 Google/이메일 로그인 추가 시 `linkWithCredential` 계열로 익명 계정을 정식 계정에 연결하기 쉬워, 무료 사용 기록/결제 정책을 이어가기 좋습니다.

## 변경 대상 파일
- `src/integrations/firebase/client.ts`
- `src/lib/useAuthReady.ts`
- `src/lib/gemini.ts`
- `src/routes/chat.tsx`
- 필요 시 공용 auth 유틸 신설 (`src/integrations/firebase/auth.ts` 또는 유사 경로)

## 검증 기준
- 콘솔에서 초기화 로그가 2번 보이더라도 실제 익명 로그인 시도는 1회만 수행
- `onAuthStateChanged` 이후 `user: null`이면 반드시 익명 로그인 분기로 진입
- 네트워크 탭에 Firebase 인증 요청이 확인됨
- 그 다음에만 `gemini-proxy` 요청이 발생
- `/chat`에서 더 이상 "연결에 문제가 생겼어요"가 반복되지 않음

## 기술 메모
- React 개발 모드의 중복 effect 실행 자체를 없애는 것이 목표는 아닙니다.
- 목표는 중복 실행 환경에서도 인증 결과가 결정적이고 idempotent하게 동작하도록 만드는 것입니다.
- Firebase 공식 권장 패턴과 관련 이슈 사례를 기준으로, auth 초기 상태 대기와 익명 로그인 요청을 분리해서 처리합니다.