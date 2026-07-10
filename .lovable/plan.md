## 목표
`@capacitor-community/speech-recognition`을 제거하고 Android 전용 커스텀 Capacitor 플러그인 `ScripicSTT`를 자체 구현하여, 메인 스레드 강제 + 상태 잠금 + 강제 destroy 타임아웃으로 음성인식 안정성을 근본 해결한다. iOS/웹 경로는 손대지 않는다.

---

## 작업 순서

### 1. AndroidManifest 확인
`android/app/src/main/AndroidManifest.xml` — `RECORD_AUDIO` 권한과 `<queries><intent><action android:name="android.speech.RecognitionService" /></intent></queries>` 블록이 이미 존재함(현재 컨텍스트로 확인). **변경 불필요, 스킵.**

### 2. 네이티브 플러그인 생성
**신규:** `android/app/src/main/java/app/lovable/aialbum/ScripicSTTPlugin.java`

- `@CapacitorPlugin(name = "ScripicSTT", permissions = { @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO }) })`
- 필드: `Handler mainHandler = new Handler(Looper.getMainLooper())`, `SpeechRecognizer recognizer`, `enum State { IDLE, STARTING, LISTENING, STOPPING }`, `volatile State state = IDLE`, `Runnable forceKillRunnable`, `boolean partialResultsEnabled`.
- **메인 스레드 강제:** `createSpeechRecognizer`, `startListening`, `stopListening`, `cancel`, `destroy` 호출은 모두 `mainHandler.post(...)`로 감싼다. 스레드명을 매 진입점에서 로그.
- **상태 잠금:** `start()` 진입 시 state ≠ IDLE 이면 내부적으로 `forceDestroy()` 실행 → `mainHandler.postDelayed`로 150ms 후 재확인 → 여전히 IDLE 아니면 `call.reject("busy")`. IDLE이면 STARTING으로 전환 후 새 인스턴스 생성.
- **매 세션 새 인스턴스:** 재사용 금지. `onResults/onError/onEndOfSpeech` 등 종료 경로 모두 `destroyAndReset()` 호출 → `recognizer = null`, state = IDLE, "stopped" 이벤트.
- **강제 타임아웃:** `stop()`에서 `cancel()` 발행 후 1200ms `forceKillRunnable` 예약. 정상 종료 콜백 도착 시 `mainHandler.removeCallbacks(forceKillRunnable)`. 타임아웃 만료 시 강제 `destroy()` + state=IDLE + "stopped" 이벤트.
- **RecognitionListener:** `onReadyForSpeech`→listeningState:"started"·state=LISTENING. `onPartialResults`→`partialResults{matches}`. `onResults`→최종 partial 한 번 더 발행 후 destroyAndReset. `onError`→error 이벤트(코드+메시지 매핑: 1 network_timeout, 2 network, 3 audio, 4 server, 5 client_error, 6 speech_timeout, 7 no_match, 8 recognizer_busy, 9 insufficient_permissions) → destroyAndReset → "stopped" 이벤트(에러 이벤트 먼저, stopped 나중).
- **메서드:**
  - `available()` → `{ available: SpeechRecognizer.isRecognitionAvailable(context) }`
  - `checkPermissions()` / `requestPermissions()` → Capacitor 표준 권한 API로 `microphone` alias 사용, `{ speechRecognition: "granted"|"denied"|"prompt" }` 형태로 매핑
  - `start({ language, partialResults })` → 위 상태 가드 후 `RecognizerIntent.ACTION_RECOGNIZE_SPEECH` Intent 구성(`EXTRA_LANGUAGE`, `EXTRA_PARTIAL_RESULTS`, `EXTRA_LANGUAGE_MODEL=LANGUAGE_MODEL_FREE_FORM`)
  - `stop()` → 위 취소 + 타임아웃 로직
  - `addListener` / `removeAllListeners` (Capacitor 기본 지원)
- **생명주기:** `handleOnDestroy()` 오버라이드 → recognizer 존재 시 `forceDestroy()`.
- 로그 태그 `ScripicSTT`, 진입 시 `Thread.currentThread().getName()` 포함.

### 3. MainActivity 등록
`android/app/src/main/java/app/lovable/aialbum/MainActivity.java`
- `onCreate` 안 `registerPlugin(AppCheckPlugin.class);` 다음 줄에 `registerPlugin(ScripicSTTPlugin.class);` 추가. 그 외 코드는 유지.

### 4. JS 플러그인 타입 정의
**신규:** `src/plugins/scripic-stt.ts`
- `registerPlugin<ScripicSTTPlugin>("ScripicSTT")` 익스포트.
- 인터페이스: `available()`, `checkPermissions()`, `requestPermissions()`, `start(opts)`, `stop()`, `addListener("partialResults"|"listeningState"|"error", cb)`.

### 5. nativeSTT.ts 전면 교체
`src/lib/nativeSTT.ts`
- `@capacitor-community/speech-recognition` import 제거 → `ScripicSTT` 사용.
- Public API(`isNativePlatform`, `isNativeSTTAvailable`, `ensureSTTPermission`, `startNativeSTT`, `stopNativeSTT`) 시그니처 유지 → `chat.tsx` 무수정.
- 유지: gen 관리, watchdog, `onCommit`, 빈 partial 무시, autoRestart, MAX_CONSECUTIVE_EMPTY_RESTARTS.
- 변경: 재시작 딜레이 450ms → 300ms. `start()`가 `"busy"`로 reject되면 500ms 지연 후 1회 재시도(그래도 실패 시 onError+onEnd).
- `error` 이벤트는 새 플러그인이 실제로 발동하므로 `try/catch` 방어 제거하고 정식 리스너로.
- 로그 태그 `[STT-native]` 유지.

### 6. 의존성 정리
- `package.json`에서 `@capacitor-community/speech-recognition` 제거.
- `android/capacitor.settings.gradle`의 해당 include 줄은 `cap sync` 시 자동 재생성되므로 수동 편집 불필요(다음 sync에서 정리됨).
- 프로젝트 전역에서 `@capacitor-community/speech-recognition` import 잔재 grep 후 제거.

### 7. 검증
- `tsgo` 타입체크로 컴파일 확인.
- `chat.tsx`의 STT 호출부는 API 동일성 재확인만.

---

## 변경/생성 파일 목록
- **신규** `android/app/src/main/java/app/lovable/aialbum/ScripicSTTPlugin.java`
- **신규** `src/plugins/scripic-stt.ts`
- **수정** `android/app/src/main/java/app/lovable/aialbum/MainActivity.java` (registerPlugin 1줄 추가)
- **수정** `src/lib/nativeSTT.ts` (플러그인 교체, 재시작 딜레이/busy 재시도 조정)
- **수정** `package.json` (의존성 1줄 제거)

## 손대지 않는 것
- `src/routes/chat.tsx` (API 동일)
- 웹/iOS 경로 (`webkitSpeechRecognition`)
- AndroidManifest (이미 요건 충족)
- 기타 라우트·프롬프트·서버 로직
