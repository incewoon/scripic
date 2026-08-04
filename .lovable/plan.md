# HEIC/HEIF 사진 선택 문제 해결

Android 고효율(HEIC/HEIF) 사진이 앨범 생성 화면에서 추가되지 않는 문제를, 선택 시 클라이언트에서 JPEG로 변환해 기존 파이프라인에 태우는 방식으로 해결한다. 서버·네이티브 변경 없음.

## 1. 의존성
- `heic2any` 설치 (package.json dependencies에 추가)

## 2. `src/routes/create.tsx`
- `import heic2any from "heic2any";` 추가
- `fileToDataUrl` 바로 위에 헬퍼 추가:
  - `isHeicFile(file)` — MIME(`image/heic|heif(-sequence)`) 또는 확장자 `.heic/.heif` 판별
  - `ensureDecodableImage(file)` — HEIC일 때만 `heic2any({ toType: "image/jpeg", quality: 0.9 })`로 변환해 `<name>.jpg` File 반환, 아니면 원본 그대로 반환
- 파일 input의 accept를 `image/*,.heic,.heif,image/heic,image/heif`로 보강 (일부 안드로이드 파일 선택기가 HEIC를 거르는 경우 대비)
- `onPick`의 검증 로직(ALLOWED_EXT/타입/용량)은 그대로 두고, 처리 루프만 교체:
  - 파일별 `ensureDecodableImage` → 변환본으로 `fileToDataUrl`
  - `extractMeta`는 EXIF 보존을 위해 원본 우선, 실패 시 변환본
  - 파일별 try/catch로 실패한 사진만 건너뛰고 나머지는 추가
  - 실패가 있으면 `toast.error(t.photoProcessFailed)`
- `ALLOWED_EXT`에는 이미 `heic|heif`가 포함되어 있어 그대로 유지
- `fileToDataUrl`의 JPEG 리사이즈 로직은 유지

## 3. `src/lib/i18n.ts`
`photoProcessFailed` 키 추가 (en/ko):
- en: "Some photos could not be loaded. Try converting HEIC to JPEG, or turn off High efficiency in the camera settings."
- ko: "일부 사진을 불러오지 못했습니다. HEIC(고효율) 사진은 변환에 실패할 수 있어요. 카메라에서 고효율 사진을 끄고 JPEG로 촬영해 보세요."

## 파일 목록
- 수정: `package.json` (+ 락파일)
- 수정: `src/routes/create.tsx`
- 수정: `src/lib/i18n.ts`

## 참고
- HEIC 변환은 브라우저에서 WASM 디코딩이라 큰 파일은 수 초 걸릴 수 있다. 기존 `busy` 인디케이터가 그동안 표시된다.
- 기존 JPEG/PNG/WebP/GIF/BMP/AVIF 경로는 변환을 거치지 않아 동작 변화가 없다.
