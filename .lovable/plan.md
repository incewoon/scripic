# Android 뒤로가기 동작 정상화 계획

## 현재 원인 분석

- `@capacitor/app`은 설치되어 있으나 어디에서도 `App.addListener('backButton', …)`를 등록하지 않음. 그래서 하드웨어 뒤로가기는 Capacitor 기본 동작(WebView.goBack, 없으면 앱 종료)에 맡겨져 있고, chat 화면에서 `window.history.pushState({memoriChatGuard})` / cleanup 시 `history.back()`가 겹치면서 히스토리 스택이 어긋남.
- 특히 `src/routes/chat.tsx` 764행 `window.history.replaceState({}, "", "/")` 가 완료 직후 URL을 "/"로 덮어써 스택이 오염됨.
- 홈(`/`)에서 뒤로가기 시 종료 확인 UI가 없어 그냥 앱이 닫히거나(스택이 얕은 경우) WebView가 이전 항목으로 감.

## 목표 동작 (네이티브 앱만)

1. 홈(`/`)에서 뒤로가기 → "앱을 종료할까요?" 확인 다이얼로그 → 확인 시 `App.exitApp()`.
2. 홈이 아닌 화면 → 라우터 히스토리 한 단계 뒤로 (예: chat → create, create → home).
3. Chat 화면에서 대화 내용이 있으면 기존 "나가기" 확인 다이얼로그 유지, 승인 시 create 화면으로 복귀.
4. 웹앱(브라우저) 동작은 변경하지 않음 — `Capacitor.isNativePlatform()` 가드로 네이티브에서만 활성화.

## 변경 파일

### 1) `src/lib/nativeBack.ts` (신규)
- `App.addListener('backButton', handler)` 를 감싸는 유틸.
- `handler({ canGoBack })` 시:
  - 전역 리스너 스택(LIFO)에 등록된 임시 핸들러가 있으면 그 핸들러가 우선 처리 (예: chat 나가기 확인).
  - 없으면 기본 규칙: `location.pathname === "/"` → 종료 확인 콜백 호출, 그 외 → `window.history.back()`.
- export: `pushNativeBackHandler(fn) → unregister`, `initGlobalNativeBack({onHomeExitRequest})`.

### 2) `src/routes/__root.tsx`
- `RootComponent`에 `useEffect`로 `initGlobalNativeBack` 등록.
- 홈 종료 요청 시 shadcn `AlertDialog` 오픈 → 확인하면 `App.exitApp()`.
- 웹에서는 `Capacitor.isNativePlatform()` false → 아무것도 하지 않음.

### 3) `src/routes/chat.tsx`
- 기존 웹용 `popstate` 기반 가드(779–856행)는 브라우저(웹앱) 동작 유지를 위해 그대로 둠. 단 네이티브에서는 중복 pushState가 스택을 오염시키므로 해당 두 `useEffect`를 `if (!Capacitor.isNativePlatform())` 가드로 감쌈.
- 대신 네이티브에서는 `pushNativeBackHandler`를 사용해:
  - preview 열려 있으면 `setPreviewIdx(null)` 후 소비,
  - `hasConversation && !generating` 이면 `setConfirmLeave(true)` 후 소비,
  - 그 외에는 unregister하여 전역 핸들러가 `history.back()` 수행하도록.
- 764행 `window.history.replaceState({}, "", "/")` 제거 — `navigate({to: "/album/$id"})`가 URL을 알아서 관리하고, 이 replaceState가 뒤로가기 스택을 망가뜨리는 주요 원인.

### 4) (변경 없음) `create.tsx`, `index.tsx`
- 기본 규칙(`history.back()`)으로 자연스럽게 create → home, chat → create로 이동.

## 기술 세부

```ts
// src/lib/nativeBack.ts
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";

type Handler = () => boolean | Promise<boolean>; // true = consumed
const stack: Handler[] = [];

export function pushNativeBackHandler(h: Handler) {
  stack.push(h);
  return () => {
    const i = stack.lastIndexOf(h);
    if (i >= 0) stack.splice(i, 1);
  };
}

export function initGlobalNativeBack(opts: { onHomeExitRequest: () => void }) {
  if (!Capacitor.isNativePlatform()) return () => {};
  const sub = App.addListener("backButton", async () => {
    for (let i = stack.length - 1; i >= 0; i--) {
      if (await stack[i]()) return;
    }
    if (window.location.pathname === "/") opts.onHomeExitRequest();
    else window.history.back();
  });
  return () => { sub.then(s => s.remove()); };
}
```

`__root.tsx` 확인 다이얼로그는 상태(`exitOpen`) + `AlertDialog` 조합. 확인 시 `import('@capacitor/app').then(({App}) => App.exitApp())`.

## 검증

- `bun run build:capacitor && bunx cap sync android` 후 실기기에서:
  1. 홈 → 뒤로 → 종료 확인 → 확인 → 종료.
  2. 홈 → create → chat(대화없음) → 뒤로 → create → 뒤로 → 홈.
  3. 홈 → create → chat(대화있음) → 뒤로 → 나가기 확인 → 승인 → create.
  4. 웹앱(브라우저)에서 기존 동작 그대로.

## 건드리지 않는 것

- STT / AI 스트리밍 / App Check / gemini finishReason / functions 코드.
- 기타 라우트 로직.
