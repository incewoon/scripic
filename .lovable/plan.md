# 채팅 입력창 음성→텍스트 마이크 버튼

`src/routes/chat.tsx` 입력창(line 567 부근) 왼쪽에 마이크 버튼을 추가해서, 사용자가 디바이스 내장 음성인식으로 말하면 그 텍스트가 입력창(`input` state)에 채워지도록 합니다. **전송은 하지 않음** — 사용자가 직접 Send 버튼을 눌러야 합니다.

## 사용 기술

- 브라우저/디바이스 내장 **Web Speech API** (`window.SpeechRecognition` / `window.webkitSpeechRecognition`).
  - iOS Safari, Chrome(Android/Desktop), Edge 모두 webkit 프리픽스로 지원.
  - 별도 서버/API 키 불필요, 디바이스 OS의 STT 엔진 사용.
- 미지원 브라우저에서는 마이크 버튼을 숨김 (또는 비활성화).

## 동작

1. 마이크 버튼 탭 → `SpeechRecognition` 인스턴스 생성 후 `start()`.
   - `lang` = 현재 i18n 언어 (`ko` → `ko-KR`, `en` → `en-US`).
   - `interimResults = true`, `continuous = false` (한 발화 단위).
2. 인식 중에는 버튼이 빨간색 + 펄스 애니메이션으로 녹음중 표시.
3. `onresult` 콜백에서 누적된 transcript를 `setInput((prev) => prev + transcript)` 로 입력창에 추가 (기존 입력값 보존).
4. 다시 탭하거나 `onend`/`onerror` 발생 시 녹음 종료, 버튼 원상복귀.
5. 권한 거부(`not-allowed`) / 오류 시 toast로 안내 (i18n).

## 변경 파일

- `src/routes/chat.tsx` — 마이크 버튼 UI + `useSpeechRecognition` 로컬 훅(같은 파일 내) 추가.
- `src/lib/i18n.ts` — 신규 문자열 `micStart`, `micListening`, `micNotSupported`, `micPermissionDenied`.

## 비변경 / 비목표

- 서버 STT(Lovable AI, ElevenLabs 등) 사용 안 함 — 사용자 요구대로 디바이스 내장 변환만.
- 자동 전송 없음 — 입력창에 텍스트만 채움.
- 다른 화면(MapDialog 등)에는 적용하지 않음.
