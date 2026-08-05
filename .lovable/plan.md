# HEIC → JPEG 네이티브 변환 (Android) + heic2any 폴백

HEIC/HEIF 변환을 Android 네이티브 플러그인으로 옮겨 장당 수 초 걸리던 WASM 디코딩을 제거한다. 웹/구형 SDK/네이티브 실패 시에만 기존 heic2any 경로로 폴백한다. 서버(functions) 변경 없음.

## 1. Android 플러그인 (신규)

`android/app/src/main/java/app/lovable/aialbum/HeicConvertPlugin.java`

- `@CapacitorPlugin(name = "HeicConvert")`, 메서드 `convert(PluginCall)`
- 입력: `path`(권장) 또는 `base64`, `quality`(기본 90), `maxDim`(기본 1280)
- 맨 앞에서 `Build.VERSION.SDK_INT < P` → `call.reject("unsupported_sdk")`
- 백그라운드 스레드(Executor)에서:
  1. path/base64 → 바이트 소스
  2. `ExifInterface`로 orientation 읽기
  3. `ImageDecoder.decodeBitmap` + `setTargetSize`(긴 변 1280, 비율 유지). 실패 시 `BitmapFactory` + `inSampleSize` 폴백
  4. orientation에 따라 `Matrix.postRotate` / flip 적용
  5. JPEG `compress(quality)` → `getCacheDir()` 임시 파일로 저장
  6. `resolve { path, mimeType: "image/jpeg", width, height }`
- `finally`에서 bitmap `recycle()` 보장, 실패 시 `call.reject("heic_convert_failed", msg)`

`MainActivity.java`: 기존 등록 유지하고 `registerPlugin(HeicConvertPlugin.class);` 한 줄 추가.

## 2. JS 래퍼 (신규)

`src/plugins/heic-convert.ts` — `registerPlugin<HeicConvertPlugin>("HeicConvert")`, 요청 사양 그대로의 인터페이스.

## 3. `src/routes/create.tsx`

`@capacitor/filesystem`은 이미 설치되어 있어 그대로 사용한다.

- 헬퍼 추가:
  - `writeTempHeic(file)` — `FileReader.readAsDataURL`로 base64를 얻어 `Filesystem.writeFile`(Directory.Cache) → `Filesystem.getUri`로 네이티브 경로 반환. 수동 바이트 루프 base64 금지.
  - `readPathAsJpegFile(path, name)` — `Filesystem.readFile`로 base64를 읽어 `fetch(dataUrl).blob()`으로 Blob → File 생성.
  - `fileToDataUrlNoResize(file)` — `FileReader.readAsDataURL`만 사용 (canvas 재인코딩 없음). 저장 파이프라인이 data URL을 기대하므로 data URL을 유지한다.
- `ensureDecodableImage(file)` 반환 타입을 `{ file, skipCanvasResize }`로 변경:
  - 비-HEIC → `{ file, skipCanvasResize: false }` (변환 경로 미진입)
  - Android 네이티브면 임시 HEIC 저장 → `HeicConvert.convert({ path, quality: 90, maxDim: 1280 })` → 결과 경로 읽어 JPEG File → `{ file, skipCanvasResize: true }`, 임시 파일 정리(`Filesystem.deleteFile`, 실패 무시)
  - 예외/비네이티브 → `console.warn` 후 동적 `import("heic2any")` 폴백, `skipCanvasResize: false`
- `onPick` 루프: `skipCanvasResize ? fileToDataUrlNoResize(decodable) : fileToDataUrl(decodable)`.
- 유지: `isHeicFile`, `mapWithConcurrency(limit=2)`, `ALLOWED_EXT`, accept 속성, EXIF는 `extractMeta(f)` 원본 우선(throw 시에만 변환본), `toast.error(t.photoProcessFailed)`, heic2any 의존성.

## 파일 목록
- 신규: `android/.../HeicConvertPlugin.java`, `src/plugins/heic-convert.ts`
- 수정: `android/.../MainActivity.java`, `src/routes/create.tsx`

## 체크리스트
- 세로 HEIC 방향 정상 (ExifInterface + Matrix)
- 디코드 단계에서 1280 다운스케일, 전체 해상도 로드 금지
- API 28 미만 → `unsupported_sdk` → heic2any 폴백
- 네이티브 성공 시 canvas 이중 리사이즈 없음
- JPEG 원본은 변환 경로 미진입
- 타입체크 통과
