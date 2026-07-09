## 문제 진단 (빌드앱 = Capacitor 네이티브)

`src/lib/nativeSTT.ts` + `src/routes/chat.tsx`의 `toggleMic()` 네이티브 분기에서 두 가지 구조적 문제가 있음.

### 1) 잠깐만 멈춰도 세션이 끝남
Android `SpeechRecognizer`는 **single-utterance**. 사용자가 0.5~1.5초만 침묵해도 플러그인이 `listeningState: "stopped"` 이벤트를 보내고, `onEnd` → `setListening(false)`로 마이크가 꺼진다. 웹의 `webkitSpeechRecognition`(continuous=true, `shouldRestartRef` 재시작 루프)과 달리, 네이티브 경로는 **자동 재시작 로직 자체가 없다** — 주석에도 "재시작 없음"으로 명시.

### 2) 버튼 눌러도 말 안 하면 완전히 먹통
- 무발화 시 Android가 던지는 error(코드 6=SPEECH_TIMEOUT, 7=NO_MATCH, 5=CLIENT 등)는 `nativeSTT.ts`에 **error 리스너가 없어서** JS로 전달되지 않는다.
- 그 경로에서는 `listeningState: "stopped"`도 보장되지 않아 `onEnd`가 발화하지 않음 → `listening=true`가 그대로 유지 → 버튼이 "활성" 상태로 얼어붙음.
- 다시 눌러 끄려 해도 `SpeechRecognition.stop()`은 이미 죽은 세션에 대해 no-op이고, 리스너는 계속 붙어있으며, `listening`은 해제되지 않음.

## 수정 계획

### A. `src/lib/nativeSTT.ts` 재설계
1. **`error` 리스너 추가** — Capacitor 플러그인의 error 이벤트를 잡아 `onError(err)` + `onEnd()` 순서로 발화해서 UI 상태를 반드시 풀어준다.
2. **watchdog 타이머** — `start()` 후 일정 시간(예: 8초) 내에 `partialResults`가 하나도 안 오면 강제로 stop → 다음 재시작 훅을 태운다. 무발화로 인한 얼음 상태 방지.
3. **재시작(continuous) 옵션** — `startNativeSTT`에 `autoRestart` 옵션 추가. 자연 종료 시 사용자가 명시적으로 stop한 게 아니면 자동으로 다시 `SpeechRecognition.start()` 재호출 (웹의 `shouldRestartRef`와 동등한 UX). `stopNativeSTT()`가 호출됐거나 권한/치명적 에러면 재시작하지 않음.
4. **누적 텍스트 처리** — 각 재시작 세션의 partial은 새 세션 기준이므로, `baseInputRef` 방식과 맞물리도록 세션 종료 시점의 partial을 확정 텍스트로 chat.tsx에 넘긴다 (`onCommit(text)` 콜백 추가). 재시작 후 partial은 다시 확정 텍스트 뒤에 이어붙게 됨.
5. **세션 상태 머신** — `idle | starting | listening | stopping` 내부 상태를 두어 중복 start/stop, 리스너 누수, 오래된 세션 이벤트 무시.

### B. `src/routes/chat.tsx` `toggleMic()` 네이티브 분기 정리
1. `startNativeSTT`에 `autoRestart: true` 전달.
2. 새 `onCommit(txt)` 훅에서 `baseInputRef.current = (baseInputRef.current + txt).replace(/\s*$/, "") + " "`로 갱신 → 다음 세션의 partial이 그 뒤에 붙음.
3. `onEnd`는 autoRestart 종결(사용자 stop 또는 fatal error) 시에만 `setListening(false)`.
4. `onError`에서 권한 오류(`not-allowed` 계열)는 toast + 강제 stop, 그 외는 로그만 남기고 재시작에 맡김.
5. 버튼 재탭 대응: `toggleMic()`에서 이미 `recGenRef.current++`로 세대 무효화 → `stopNativeSTT()` 내부에서 리스너/타이머 확실히 정리하도록 보강.

### C. 유지보수용 상세 콘솔 로그 (프로세스별 태그 통일)
모든 로그는 `[STT-native]` prefix + step 태그.
- `[STT-native] available? { supported }`
- `[STT-native] permission { before, after, granted }`
- `[STT-native] start requested { lang, gen, autoRestart }`
- `[STT-native] listeners attached { partial, state, error }`
- `[STT-native] plugin.start OK / FAIL { err }`
- `[STT-native] partial#N { len, text }`  (긴 텍스트는 앞 40자만)
- `[STT-native] listeningState { status }`
- `[STT-native] error event { code, message }`
- `[STT-native] watchdog fired (no partial in Xs) → restart`
- `[STT-native] session end { reason: user|silence|error|watchdog, willRestart }`
- `[STT-native] restart attempt #N`
- `[STT-native] stop requested { reason }`
- `[STT-native] listeners detached`

`chat.tsx`쪽 `toggleMic` 네이티브 분기에도 `[mic native]` 태그로 진입/토글/콜백별 로그를 남긴다.

### D. 웹 경로는 손대지 않음
`createRecognition()`/`armSilenceTimer()` 등 브라우저 경로는 정상 작동 중이므로 수정 없음.

## 변경 파일
- `src/lib/nativeSTT.ts` — 재설계 (autoRestart, error 리스너, watchdog, onCommit, 상태머신, 상세 로그)
- `src/routes/chat.tsx` — `toggleMic()` 네이티브 분기만 수정 (autoRestart + onCommit 처리 + 로그)

## 검증
- `bunx tsgo`로 타입체크
- 앱 재빌드 후: (1) 말하는 도중 1~2초 침묵해도 세션이 이어지는지, (2) 버튼 눌러놓고 말 안 해도 다시 눌러 끌 수 있는지, (3) 다시 켰을 때 이전 확정 텍스트가 유지되는지, (4) 콘솔에 프로세스 별 로그가 나오는지 확인
