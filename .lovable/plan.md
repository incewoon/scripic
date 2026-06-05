## 문제 진단

스크린샷에서 사진 1장 업로드 후 **첫 AI 응답 시도부터** 빨간 배너 "AI 사용량이 한도에 도달했어요"가 표시됨. Firestore의 일일 한도(`daily_limits`)는 앨범 생성 시점에만 카운트되고 chat 호출 자체는 한도 차감을 하지 않음. 즉 **실제 한도가 아님**.

원인: `functions/src/gemini.ts`에서 Gemini가 반환하는 **429와 503을 동일하게 `GeminiRateLimitError`로 처리**하고, `functions/src/index.ts`(chat / generateAlbum / 모든 호출 지점)에서 이를 무조건 `kind: "ai_quota"`로 매핑함. 503은 사실 "Gemini 서버 일시 과부하 / 모델 사용 불가"인데도 "AI 한도 도달"로 표시됨.

- `gemini-2.5-flash-lite` 모델 + 멀티모달(사진) 요청은 종종 503/UNAVAILABLE을 반환.
- 클라이언트(`src/routes/chat.tsx`, `src/lib/aiClient.ts`)는 `kind === "ai_quota"`면 무조건 `t.aiQuota` 토스트.
- 재시도 로직 없음 → 일시 과부하가 곧장 사용자에게 "한도 도달"로 노출.

## 수정 계획

### A. `functions/src/gemini.ts`
1. `GeminiRateLimitError` → 두 클래스로 분리(또는 `kind` 필드 추가):
   - `GeminiQuotaError` (status 429): 진짜 쿼터 / per-minute rate limit.
   - `GeminiUnavailableError` (status 503/500/502/504): 일시 과부하.
2. `geminiGenerate` / `geminiStreamText` 양쪽에서 **503 계열에 한해 지수 백오프 자동 재시도(최대 2회, 500ms→1.2s)** 적용. 재시도 후에도 실패하면 `GeminiUnavailableError` throw.
3. 429는 즉시 throw(재시도 없음).

### B. `functions/src/index.ts` (chat / generateAlbum / 그 외 호출부 3곳: 라인 ~241, ~409, ~545)
- `GeminiQuotaError` → 기존 그대로 `HttpsError("resource-exhausted", ..., { kind: "ai_quota", status: 429 })`.
- `GeminiUnavailableError` → 새 코드 `HttpsError("unavailable", "ai_unavailable", { kind: "ai_unavailable", status })`. (Firebase가 `functions/unavailable`로 직렬화.)
- `generateAlbum`에서 `GeminiUnavailableError`도 `rollbackDailyCount()` 후 throw하도록 분기 유지.

### C. 클라이언트 매핑
- `src/routes/chat.tsx` (라인 260–270, 386–395): `kind === "ai_unavailable"` 또는 `code === "functions/unavailable"`이면 별도 토스트 `t.aiBusy`("AI가 잠시 혼잡해요. 잠시 후 다시 시도해주세요.")로 표시. `ai_quota`는 진짜 쿼터일 때만.
- `src/lib/i18n.ts`: `aiBusy` 키 추가 (ko: "AI가 잠시 혼잡해요. 잠시 후 다시 시도해주세요.", en: "The AI service is temporarily busy. Please try again in a moment.").

### D. (선택) chat 모델 변경 검토
- `functions/src/gemini.ts`의 모델을 `gemini-2.5-flash-lite` → `gemini-2.5-flash`로 올리면 503 빈도가 줄어드는 경향. 이번 PR에서는 **기본 모델은 그대로 두고**, 재시도 + 에러 분리로 사용자 경험만 먼저 개선. 모델 교체는 별도 결정으로 남김.

### E. 배포
- 위 모두 서버 변경이므로 `firebase deploy --only functions:chat,functions:generateAlbum` 필요. 클라이언트는 자동 반영.

## 영향 없는 항목
- Firestore `daily_limits` 로직, App Check, 마무리(`[READY_TO_FINISH]`) 흐름, 사진 업로드 로직 등은 손대지 않음.
