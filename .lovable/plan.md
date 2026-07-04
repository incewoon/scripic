## 원인 분석

세 문제 모두 **웹 브라우저 API를 그대로 Android WebView(Capacitor)에서 쓰면서 발생**하는 네이티브 특유 이슈입니다.

### 1. 앨범 이미지 저장 안 됨
`src/routes/album.$id.tsx`의 `downloadImage()`가 `<a href={dataUrl} download>` + `a.click()` 방식으로 파일을 내려받습니다. Android WebView는 data:/blob: URL의 anchor download를 무시(또는 조용히 실패)해서 아무 파일도 저장되지 않습니다. → **네이티브에서는 Capacitor Filesystem으로 저장**해야 합니다. (`src/lib/backup.ts`의 성공 사례와 동일 패턴)

### 2. AI 대화 음성입력 “권한 없음” 에러
`src/routes/chat.tsx`가 `window.webkitSpeechRecognition`(Web Speech API)를 사용합니다. Android WebView에서 이 API를 호출하면:
- `AndroidManifest.xml`에 `RECORD_AUDIO` 권한이 없고,
- Capacitor 기본 `WebChromeClient`가 `onPermissionRequest`를 자동으로 승인하지 않아서
`not-allowed` / `service-not-allowed`로 즉시 에러가 납니다.  
가장 안전한 해결책은 웹 API를 그대로 두되, **네이티브에서는 `@capacitor-community/speech-recognition` 플러그인**을 통해 OS의 STT + 마이크 권한을 사용하도록 분기하는 것입니다. (Manifest 조작만으로는 WebView permission bridge까지 뚫어야 해서 유지보수 부담이 큽니다.)

### 3. 설정 백업 다운로드가 “공유창”만 뜸
`src/lib/backup.ts:173-194`가 네이티브에서 `Filesystem.writeFile`로 저장한 뒤 **바로 `Share.share(...)`를 호출**해 시스템 공유시트를 띄웁니다. 사용자는 “저장만” 원하므로 Share 호출을 제거하고, 저장된 경로를 토스트로 안내하면 됩니다. `Directory.Documents`는 Android에서 `Documents/` 폴더(파일 앱에서 접근 가능)로 저장됩니다.

---

## 변경 계획

### A. 앨범 이미지 저장 — `src/routes/album.$id.tsx` `downloadImage()`
- `toPng`로 dataURL 생성까지는 동일.
- `Capacitor.isNativePlatform()` 분기 추가:
  - **웹**: 지금처럼 `<a download>`.
  - **네이티브**: dataURL의 base64 부분을 잘라 `Filesystem.writeFile({ path: '<title>.png', data: base64, directory: Directory.Documents, recursive: true })`. 성공 토스트에 “문서 폴더에 저장됨” 문구(신규 i18n key `savedToDocuments`) 표시.
- 실패 시 기존 `t.failed` 유지.

### B. 음성입력 — `src/routes/chat.tsx` + 신규 플러그인
1. `@capacitor-community/speech-recognition` 추가.
2. `AndroidManifest.xml`에 `<uses-permission android:name="android.permission.RECORD_AUDIO" />` 추가.
3. `src/lib/nativeSTT.ts`(신규) — 얇은 래퍼:
   - `isNativeSTTAvailable()`: `Capacitor.isNativePlatform() && (await SpeechRecognition.available()).available`
   - `startNativeSTT({ lang, onPartial, onFinal, onError, onEnd })`: 권한 체크(`checkPermissions` → 필요시 `requestPermissions`) 후 `SpeechRecognition.start({ language, partialResults: true, popup: false })` + `addListener('partialResults', ...)`. 침묵 감지는 기존 `SILENCE_TIMEOUT_MS` 로직 재사용.
   - `stopNativeSTT()`.
4. `chat.tsx` `toggleMic()`에서 네이티브면 위 래퍼 사용, 웹이면 기존 `webkitSpeechRecognition` 유지. `recognitionRef` / `baseInputRef` / `armSilenceTimer` 흐름은 그대로 재활용.
5. 권한 거부 시 `t.micPermissionDenied` 토스트(기존 문구 재사용).

### C. 백업 저장 — `src/lib/backup.ts`
- 네이티브 분기(`173-194`)에서 `Share.share(...)` 호출 및 `@capacitor/share` import 제거.
- 저장 후 `toast.success`가 이미 상위에서 호출되지 않는다면(호출부 확인 필요) 함수 반환값으로 저장된 경로를 돌려주고, `settings.tsx` 백업 다운로드 핸들러에서 “Documents/scripic-backup-….bak 로 저장되었습니다” 토스트 표시. 새 i18n key: `backupSavedTo`.

### D. i18n 키 추가 (`src/lib/i18n.ts`)
- `savedToDocuments`: "이미지가 문서 폴더에 저장되었어요" / "Saved to Documents"
- `backupSavedTo`: "백업 파일을 저장했어요: {path}" / "Backup saved to: {path}"

### E. 문서/설정
- `capacitor.config.ts`는 수정 불필요.
- 새 플러그인 추가 후 `bunx cap sync android`가 GitHub Actions에서 자동 실행되므로 workflow yaml 변경 없음.

---

## 로컬 검증 절차 (선택)

GitHub Actions에서만 빌드해도 되지만, 로컬에서 실기기 확인을 원하면:

```bash
git pull
bun install                     # 새 플러그인(@capacitor-community/speech-recognition) 설치
bun run build:capacitor         # 웹 자산 빌드
bunx cap sync android           # 네이티브 프로젝트에 플러그인/자산 동기화
cd android
./gradlew assembleDebug         # 또는 Android Studio에서 Run
# 실기기 연결 후:
adb install -r app/build/outputs/apk/debug/app-debug.apk
```
- Java 21 + Android SDK(compileSdk 36)는 workflow와 동일.
- 첫 실행 시 마이크/저장 권한 프롬프트가 뜨는지 확인.
- Play 내부테스트 배포는 기존 workflow(`workflow_dispatch`) 그대로 재실행.

---

## 기술 세부

- **왜 `MediaStore` 대신 `Directory.Documents`?** Capacitor 6+ 이후 Documents 디렉터리는 Android Scoped Storage 하에서도 파일 앱에서 접근 가능한 위치로 매핑됩니다. `Directory.External`은 앱 삭제 시 사라지므로 백업/이미지 용도로 부적합.
- **왜 웹 Speech API를 네이티브에서 직접 못 쓰나?** `MainActivity`에서 커스텀 `WebChromeClient.onPermissionRequest`를 override해서 `PermissionRequest.RESOURCE_AUDIO_CAPTURE`를 grant해야 하고 그 위에 RECORD_AUDIO 런타임 권한까지 요청해야 합니다. Capacitor 플러그인이 이 전 과정을 캡슐화해 훨씬 안정적입니다.
- **회귀 영향 최소화**: 웹앱 경로(웹 브라우저)는 전부 그대로. 네이티브 분기만 신설.

## 요약
- 이미지 저장/백업: `Filesystem.writeFile` 사용, 백업 저장 후 `Share` 호출 제거.
- 음성입력: `@capacitor-community/speech-recognition` 플러그인 도입 + `RECORD_AUDIO` 권한 추가, 웹은 기존 로직 유지.
- yaml 변경 없음. 로컬 재빌드 원하면 위 명령 순서대로 실행.
