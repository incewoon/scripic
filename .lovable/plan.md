# 임시 테스트 환경 구축 플랜 (Lovable AI Gateway 우회)

## 목표

Firebase 배포 전에 **웹 미리보기에서 채팅/앨범 생성 흐름 전체**를 테스트할 수 있도록, Supabase Edge Function을 한 번 더 만들어 Lovable AI Gateway(Gemini)를 호출합니다. Firebase가 설정되면 자동으로 Firebase 경로로 전환됩니다. Android Studio 빌드 단계에서는 코드 수정 없이 Firebase 환경변수만 채우면 정식 경로로 동작합니다.

---

## 작업 항목

### 1. Supabase Edge Function 2개 추가
- `supabase/functions/chat-fallback/index.ts`
  - Lovable AI Gateway `chat/completions` 호출 (스트리밍 SSE)
  - 기존 `functions/src/prompts-chat.ts`의 시스템 프롬프트 로직을 Deno로 포팅
  - 입력: `{ messages, photos, photoCount, lang, mode, maxTurnsPerPhoto }`
  - 출력: SSE 스트림 (delta 텍스트)
- `supabase/functions/album-fallback/index.ts`
  - Lovable AI Gateway 호출 + tool calling으로 구조화된 앨범 JSON 추출
  - `prompts-album.ts`의 시스템/유저 프롬프트 + tone instruction 포팅
  - 입력: `{ messages, photoCount, lang, period, location, mode, tone }`
  - 출력: `{ title, subtitle, intro, captions, closing, ... }` JSON
- 두 함수 모두 `verify_jwt = false` (`supabase/config.toml` 업데이트)
- 일일 1앨범 제한은 클라이언트 `dailyLimit.ts`로만 임시 체크 (정식 모드에선 Firestore가 담당)

### 2. `src/lib/aiClient.ts` 분기 추가
```text
isFirebaseReady() ? Firebase httpsCallable : Supabase functions.invoke (스트리밍은 fetch+SSE)
```
- `aiChatStream`: Firebase 미설정 시 `${VITE_SUPABASE_URL}/functions/v1/chat-fallback` 으로 fetch 스트리밍
- `aiGenerateAlbum`: Firebase 미설정 시 `supabase.functions.invoke('album-fallback')`
- `aiDailyStatus`: Firebase 미설정 시 로컬 `dailyLimit.ts` 값 반환

### 3. 에러 처리
- 429 / 402 응답 시 i18n 키로 사용자에게 토스트 (요금 초과 / rate limit)
- 채팅 화면의 "연결에 문제가 생겼어요" 토스트가 더 이상 뜨지 않는지 확인

### 4. 검증
- `supabase--deploy_edge_functions` 로 두 함수 배포
- `supabase--curl_edge_functions` 로 양쪽 동작 확인
- 미리보기에서 사진 1장 업로드 → 대화 → 앨범 생성까지 한 사이클 수동 확인

---

## 작업하지 않는 것 (의도적)

- Firebase Functions 코드(`functions/src/*`) 변경 없음 — 그대로 둠
- `src/integrations/firebase/client.ts` 변경 없음 — Firebase 환경변수가 채워지면 자동으로 Firebase 경로 사용
- 기존 Capacitor 설정, `FIREBASE_SETUP.md` 변경 없음
- 일일 제한의 서버측 강제 (이건 Firebase 경로에서만 유효, 임시 테스트용 fallback은 클라이언트 카운터만)

---

## 결과 흐름

```text
[웹 미리보기]
  ├─ Firebase env 비어있음 → Supabase Edge (Lovable AI Gateway → Gemini)
  └─ 즉시 채팅/앨범 테스트 가능

[Android Studio 빌드 후]
  ├─ VITE_FIREBASE_* 채워짐 → Firebase httpsCallable → Cloud Function → Gemini
  └─ App Check + Firestore 일일 제한 강제
```

코드 한 줄도 안 건드리고 환경변수 세팅만으로 두 모드를 오갈 수 있습니다.

---

## 기술 세부 (참고)

- Lovable AI Gateway: `https://ai.gateway.lovable.dev/v1/chat/completions`, 모델 `google/gemini-2.5-flash-lite` (Firebase 측과 동일하게 맞춤)
- 인증: Edge Function 내부에서 `Deno.env.get("LOVABLE_API_KEY")` (이미 secret으로 존재)
- 프롬프트 파일은 Deno에서 직접 import 불가 → 두 함수 안에 인라인 복제 (단일 출처를 원하면 추후 `supabase/functions/_shared/prompts/`로 정리 가능)
- 클라이언트 SSE 파싱은 `aiClient.ts`에서 line-by-line으로 처리 (AI Gateway 가이드 패턴)
