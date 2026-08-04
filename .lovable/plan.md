# HEIC/HEIF 사진 선택 문제 해결

Android 고효율(HEIC/HEIF) 사진이 앨범 생성 화면에서 추가되지 않는 문제를, 선택 시 클라이언트에서 JPEG로 변환해 기존 canvas 파이프라인에 태우는 방식으로 해결한다. 서버·네이티브 변경 없음.

## 1. 의존성
- `heic2any` 설치 (package.json dependencies에 추가)

## 2. `src/routes/create.tsx`
- 정적 import 금지. `heic2any`는 HEIC일 때만 동적 `import("heic2any")`로 로드해 번들 크기를 지킨다.
- `fileToDataUrl` 바로 위에 헬퍼 3개 추가:
  - `isHeicFile(file)` — MIME(`image/heic|heif(-sequence)`) 또는 확장자 `.heic/.heif` 판별
  - `ensureDecodableImage(file)` — HEIC일 때만 동적 로드 후 `heic2any({ toType: "image/jpeg", quality: 0.9 })`로 변환해 `<name>.jpg` File 반환, 아니면 원본 즉시 반환
  - `mapWithConcurrency(items, limit, fn)` — 배치 단위 병렬 실행 (저사양 Android 메모리 보호)
- 파일 input accept를 `image/*,.heic,.heif,image/heic,image/heif`로 보강
- `onPick`의 검증 로직(ALLOWED_EXT/타입/용량)은 그대로 두고 처리 루프만 교체:
  - `mapWithConcurrency(slice, 2, ...)` — 동시 처리 최대 2장
  - 표시용 픽셀: `ensureDecodableImage` → `fileToDataUrl`
  - EXIF: 항상 원본 `f`로 `extractMeta` 먼저, throw될 때만 변환본 폴백
    - `extractMeta`는 실패 시 throw가 아니라 빈 객체 `{}`를 반환한다. 원본 우선 호출과 throw 폴백만 유지하고, 빈 `{}`를 실패로 간주해 변환본을 다시 호출하지는 않는다 (변환 JPEG도 EXIF가 비는 경우가 많아 이득이 없음).

  - 파일별 try/catch로 실패한 사진만 건너뛰고 나머지는 추가
  - 실패가 있으면 `toast.error(t.photoProcessFailed)`
- `ALLOWED_EXT`에는 이미 `heic|heif`가 포함되어 있어 그대로 유지
- `fileToDataUrl`의 JPEG 리사이즈(canvas) 로직은 유지

## 3. `src/lib/i18n.ts`
`photoProcessFailed` 키 추가 (en/ko):
- en: "Some photos could not be loaded. If you use High efficiency (HEIC) in the camera, try again or switch to JPEG in camera settings."
- ko: "일부 사진을 불러오지 못했습니다. 카메라 고효율(HEIC) 사진일 수 있어요. 다시 시도하거나 카메라 설정에서 고효율 사진을 끄고 JPEG로 촬영해 보세요."

기존 `useT()` 패턴 그대로 사용.

## 파일 목록
- 수정: `package.json` (+ 락파일)
- 수정: `src/routes/create.tsx`
- 수정: `src/lib/i18n.ts`

## 체크리스트 (완료 후 확인)
- EXIF는 원본 File 우선
- 동시 처리 limit = 2
- heic2any는 동적 import만
- HEIC가 아닌 파일은 변환 경로를 타지 않음
