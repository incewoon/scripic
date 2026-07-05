## Problem

빌드된 Android 앱에서 AI 대화모드의 마이크 버튼:
- 누르면 녹음이 시작됐다가 잠깐 뒤 스스로 멈춤
- 다시 눌러도 정지가 안 됨 (상태가 꼬임)
- 웹에서는 정상 동작

## Root cause

`src/routes/chat.tsx` 의 `toggleMic` 네이티브 분기와 `src/lib/nativeSTT.ts` 의 구조가 **Web Speech API** 흐름을 그대로 흉내내서 생긴 문제:

1. **자동 재시작 루프 (핵심 원인)**  
   Android 의 `SpeechRecognizer`(= `@capacitor-community/speech-recognition`)는 본질적으로 **single-utterance**. 짧은 침묵이 감지되면 플러그인이 `listeningState: "stopped"` 를 쏘고 세션이 끝난다.  
   현재 `onEnd` 핸들러는 `shouldRestartRef.current` 가 true 이면 곧바로 `startOnce()` 를 다시 부른다 → `detachListeners()` → `addListener` → `SpeechRecognition.start()`.  
   이 재시작이 플러그인 내부의 stop 트랜지션과 겹치면서 두 번째 `start()` 가 조용히 실패하거나, 리스너가 detach 되어 UI 상태(`listening`) 와 실제 플러그인 상태가 어긋난다. 그 결과 "녹음이 멈춘 것처럼 보이고, 버튼을 다시 눌러도 반응이 이상함".

2. **`silenceTimer` 이중 트리거**  
   `armSilenceTimer()` 는 타임아웃이 지나면 `recognitionRef.current?.stop()` 만 호출한다 — 네이티브 경로에서는 `recognitionRef` 가 비어있어서 no-op. 대신 네이티브에서는 플러그인이 알아서 자동 종료 → 재시작 루프와 충돌.

3. **stop 버튼이 안 먹는 이유**  
   auto-stop 이 먼저 발생 → `onEnd` 가 restart 시도 → 이 사이에 사용자가 버튼을 누르면 `listening` 값이 이미 false 로 세팅되고 있거나(레이스), `recGenRef` 가 restart 쪽에서 새로 발급되어 있어서 사용자의 stop 이 무시된다.

웹에서는 `webkitSpeechRecognition` 이 `continuous:true` 를 실제로 지원해서 stop 을 명시적으로 부르기 전까지 세션이 유지된다 — 그래서 동일 로직이 웹에서만 정상 동작.

## Fix plan

Android/iOS 네이티브 경로를 "단발성 세션 + 명시적 정지" 모델로 재작성. 웹 로직은 그대로 유지.

### 1. `src/lib/nativeSTT.ts` 개선
- `startNativeSTT` 에 `onError(err)` 콜백 추가 (플러그인 error 이벤트 전달).
- 리스너 등록 순서를 `addListener → start` 로 유지하되, `stopNativeSTT` 에서는:
  - `SpeechRecognition.stop()` 을 `await` 로 완료까지 대기
  - 그 다음 `detachListeners()` 호출 (반대 순서로 하면 stopped 이벤트가 유실됨)
- iOS 를 위해 `listeningState` 뿐 아니라 Android `partialResults` 종료 신호도 함께 처리.

### 2. `src/routes/chat.tsx` 네이티브 분기 재작성
- **자동 재시작 제거**: `onEnd` 에서 `startOnce()` 를 재호출하지 않는다. Android 는 single-utterance 라는 것을 그대로 반영 — 세션이 끝나면 그대로 종료하고 `setListening(false)` 만 수행. 사용자가 다시 말하려면 버튼을 다시 누른다. (웹은 기존 continuous 재시작 로직 유지.)
- **silenceTimer 는 웹 전용**: 네이티브 경로에서는 `armSilenceTimer` 를 호출하지 않는다 (플러그인이 알아서 침묵 감지).
- **stop 경로 안정화**:
  - `toggleMic` 의 stop 분기에서 `shouldRestartRef.current = false` → `recGenRef.current++` → `await stopNativeSTT()` → `setListening(false)` 순서를 유지.
  - `stopNativeSTT()` 가 await 되도록 함수 시그니처를 async 로 맞추고, 실패해도 UI 상태는 무조건 false 로 복구.
- **partial 누적 방식 유지**: `baseInputRef` + 마지막 partial 로 input 값 계산 (현재와 동일).
- **에러 토스트**: `startNativeSTT` 가 던지는 에러를 catch 해서 `t.micNotSupported` 또는 `t.micPermissionDenied` 토스트, 상태 원복.

### 3. `chat.tsx` UI 힌트 (선택)
- 네이티브에서 세션이 짧게 끝나는 게 정상임을 사용자가 알 수 있도록, `t.micCoach` / `chatCoachMicBody` 안내 문구에 "한 문장씩 말하고 버튼을 다시 눌러 이어 말하세요" 뉘앙스가 없다면 i18n 문구만 살짝 조정 (기존 문구 확인 후 결정, 없으면 이 단계 skip).

### 파일 변경
- `src/lib/nativeSTT.ts` — 리스너 정리 순서, `onError` 콜백, stop await 처리.
- `src/routes/chat.tsx` — 네이티브 분기의 auto-restart 제거, silence 타이머 네이티브에서 미사용, stop 경로 안정화. 웹 경로는 변경 없음.

### 재빌드 안내
로컬에서 확인하려면:
```
git pull
bun install
bun run build:capacitor
bunx cap sync android
cd android && ./gradlew assembleDebug
```
GitHub Actions 빌드도 그대로 사용 가능 (플러그인/매니페스트 변경 없음).
