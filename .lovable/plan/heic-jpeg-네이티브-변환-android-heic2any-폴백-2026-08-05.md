# HEIC → JPEG 네이티브 변환 (Android) + heic2any 폴백

HEIC/HEIF 변환을 Android 네이티브 플러그인으로 옮겨 장당 수 초 걸리던 WASM 디코딩을 제거한다. 웹/구형 SDK/네이티브 실패 시에만 기존 heic2any 경로로 폴백한다. 서버(functions) 변경 없음.

## 1. Android 플러그인 (신규)

`android/app/src/main/java/app/lovable/aialbum/HeicConvertPlugin.java`

- `@CapacitorPlugin(name = "HeicConvert")`, 메서드 `convert(PluginCall)`
- 입력: `path`(권장) 또는 `base64`, `quality`(기본 90, 1~100 클램프), `maxDim`(기본 1280, 최소 256 클램프 — 잘못된 값도 크래시 없이 기본값)
- 맨 앞에서 `Build.VERSION.SDK_INT < P` → `call.reject("unsupported_sdk")`로 즉시 종료
- 백그라운드 Executor에서 처리:
  1. `path`가 `file://`로 시작하면 prefix 제거한 절대 경로로 열고, 실패 시 원본 문자열로 한 번 더 시도. 둘 다 실패하면 `heic_convert_failed` reject (JS 폴백 유도)
  2. `ExifInterface`로 orientation 읽기 — 90/180/270 및 flip 조합까지 Matrix로 전부 처리
  3. `ImageDecoder.decodeBitmap` + `setTargetSize`(긴 변 maxDim, 비율 유지). 실패 시 `BitmapFactory` + `inSampleSize` 폴백이며 이 경로에서도 maxDim 기준 축소 계산 후 디코딩 (전체 해상도 로드 금지)
  4. orientation 적용 (immutable bitmap이면 회전 전 copy)
  5. JPEG `compress(quality)` → `getCacheDir()`에 UUID 파일명 `heic-convert-{uuid}.jpg`으로 저장 (동시 2장 충돌 방지)
  6. `resolve { path, mimeType: "image/jpeg", width, height }` — base64가 아닌 경로 반환
- try/finally로 bitmap `recycle()` 보장, 실패 시 `call.reject("heic_convert_failed", msg)`
- resolve/reject는 백그라운드 완료 후 그대로 호출 (별도 메인 스레드 전환 불필요)

`MainActivity.java`: 기존 등록(AppCheck, ScripicSTT, NotificationPermission) 유지하고 `registerPlugin(HeicConvertPlugin.class);` 한 줄만 추가.

## 2. JS 래퍼 (신규)

`src/plugins/heic-convert.ts` — `registerPlugin<HeicConvertPlugin>("HeicConvert")`, 입력 `{ path?, base64?, quality?, maxDim? }` / 출력 `{ path, mimeType, width?, height? }`.

## 3. `src/routes/create.tsx`

`@capacitor/filesystem`은 이미 설치되어 있어 그대로 사용한다.

- 헬퍼 추가:
  - `writeTempHeic(file)` — `FileReader.readAsDataURL`로 base64 획득(수동 바이트 루프 금지) → `Filesystem.writeFile`(Directory.Cache, UUID 파일명) → `Filesystem.getUri`로 네이티브 경로 반환
  - `readPathAsJpegFile(path, name)` — `Filesystem.readFile` base64 → `fetch(dataUrl).blob()` → File 생성
  - `fileToDataUrlNoResize(file)` — `FileReader.readAsDataURL`만 사용 (canvas 재인코딩 없음)
- `ensureDecodableImage(file)` 반환 타입을 `{ file, skipCanvasResize }`로 변경:
  - 비-HEIC → `{ file, skipCanvasResize: false }`
  - Android 네이티브: `writeTempHeic` → `HeicConvert.convert({ path, quality: 90, maxDim: 1280 })` → `readPathAsJpegFile`로 JPEG File 생성 → `{ file, skipCanvasResize: true }`
    - HEIC 임시 파일은 성공/실패 무관하게 `Filesystem.deleteFile` 정리 시도(실패 무시)
    - JPEG 결과 임시 파일은 메모리 File 생성 **이후에만** 삭제
  - 네이티브 호출 실패 또는 JS 후처리 실패 → `console.warn` 후 동적 `import("heic2any")` 폴백, `skipCanvasResize: false`
  - heic2any 폴백까지 실패하면 예외를 삼키지 말고 그대로 throw → `onPick`의 파일별 try/catch가 `null` 처리 → `t.photoProcessFailed` 토스트 반영
- `onPick` 루프: `skipCanvasResize ? fileToDataUrlNoResize(decodable) : fileToDataUrl(decodable)`
- 유지: `isHeicFile`, `mapWithConcurrency(limit=2)`, `ALLOWED_EXT`, accept 속성, EXIF는 `extractMeta(f)` 원본 우선(throw 시에만 변환본), heic2any 의존성.

## 하지 않을 것
- functions(서버) 수정, STT/Notification/AppCheck 동작 변경, iOS 네이티브 플러그인, EXIF 순서 변경, 동시성 2 해제, 결과 base64 반환

## 파일 목록
- 신규: `android/.../HeicConvertPlugin.java`, `src/plugins/heic-convert.ts`
- 수정: `android/.../MainActivity.java`, `src/routes/create.tsx`

## 체크리스트
- 세로 HEIC 방향 정상 (ExifInterface + Matrix)
- 디코드 단계에서 maxDim 축소, 전체 해상도 로드 없음
- API 28 미만 → `unsupported_sdk` → heic2any 폴백
- 동시 2장 UUID 임시 파일명 충돌 없음
- 네이티브 성공 시 canvas 이중 리사이즈 없음
- 폴백까지 실패 시 해당 사진만 빠지고 실패 토스트 노출
- JPEG 원본은 변환 경로 미진입 / 타입체크 통과
