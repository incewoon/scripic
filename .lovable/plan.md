## 확인된 문제 3가지

### 1. 다른 폰에서 후기 검증 시도 → "오늘 이미 추가 앨범 사용" 메시지
원인: `functions/src/index.ts`의 `rateLimitKey()`가 App Check `appId`를 1순위 키로 쓰고 있는데, **App Check appId는 앱 등록 단위의 식별자라 같은 앱을 설치한 모든 기기에서 동일합니다.** 그래서 한 기기에서 보너스를 받으면 `daily_limits/app:<appId>` 문서 하나에 `bonusGranted=true`가 찍히고, 다른 기기에서 후기 검증을 호출해도 같은 문서를 보고 "이미 지급됨" 단락 처리됩니다. `reserveDailyAlbum`의 1/2개 카운트도 같은 이유로 기기 간 공유돼서, 한 기기가 만들면 다른 기기에서 못 만드는 상황이 생길 수 있음.

### 2. 태블릿에서 앨범 마무리 단계 "요청이 너무 많다, 잠시 후 다시 시도"
원인: 이건 후기/제한 로직이 아니라 **`generateAlbum` → Gemini 호출이 429(quota/rate limit)로 떨어진 경우**입니다. 현재 `geminiGenerate`는 비-2xx 응답을 그대로 `Error("Gemini error 429: ...")`로 throw → `HttpsError("internal", ...)`로 클라이언트에 전달되고, `create.tsx` 쪽에서 일반 에러 메시지로 보입니다. 사용자에겐 "요청이 너무 많아요"처럼 한국어로 안내되고 있고 진행은 막혀 있는 상태. 추가로 이 케이스에서 **이미 burn된 일일 카운터가 롤백되지 않아** 사용자가 오늘 다시 시도하면 1개 제한에 막힐 수 있음(`reserveDailyAlbum`은 호출 직후에 +1을 커밋함).

### 3. Memory Weaver 옛 스크린샷이 정상 승인됨
원인: 직전 수정에서 프롬프트를 너무 관대하게 풀면서 "Memory Weaver / 메모리위버"를 명시적 허용 브랜드로 넣었습니다. 사용자가 원하는 건 **현재 브랜드(Scripic / 스크립픽 / ince.lovable.app)만 인정**.

---

## 구현 계획 (functions와 client 둘 다 손봄, 범위는 위 3건에 한정)

### A. 디바이스별로 안전하게 분리되는 rate-limit 키
`functions/src/index.ts`의 `rateLimitKey()`를 바꿔서:
- 항상 클라이언트가 보내는 `deviceId`를 1순위로 사용 (`dev:<deviceId>`).
- `deviceId`가 비어 있을 때만 App Check `appId`를 보조 키로 사용.
- 두 값 다 없으면 기존처럼 `failed-precondition`.

이미 `ReviewRewardDialog`와 `create.tsx`(확인 필요)에서 `getDeviceId()`를 보내고 있고, `getDeviceId()`는 `localStorage`에 저장된 per-install UUID라 기기별로 다릅니다. 이걸 1순위로만 바꾸면 보너스/일일카운트가 기기별로 독립됩니다. (`chat`/`generateAlbum`도 같은 키 함수를 쓰므로 `deviceId`가 전달되는지 확인하고, 누락이면 보내도록 보강.)

### B. Gemini 429(과부하/쿼터) 케이스 처리 강화
1. `functions/src/gemini.ts`에 사용자 정의 에러 클래스(`GeminiRateLimitError`) 추가하고, `res.status === 429` 또는 `503`일 때 이걸 throw.
2. `generateAlbum` 핸들러에서:
   - try/catch로 감싸 `GeminiRateLimitError`면 `HttpsError("resource-exhausted", "ai_rate_limit")`로 변환.
   - 이 경로에서는 **방금 차감한 일일 카운터를 롤백**(현재 `gemini did not return album` 분기처럼 `count: 0`로 merge)해서 사용자가 오늘 재시도할 수 있게 함.
3. `chat` 핸들러도 동일하게 429를 `resource-exhausted`로 매핑(여긴 카운터를 안 까니까 롤백 불필요).
4. 클라이언트(`src/lib/aiClient.ts` 또는 `src/routes/create.tsx`)의 호출부에서 `functions/resource-exhausted` && reason `ai_rate_limit`이면 "지금 AI가 많이 붐벼요. 1–2분 뒤 다시 시도해 주세요. 오늘 앨범 생성권은 그대로 남아 있어요." 같은 명확한 메시지로 분기.

### C. 후기 검증 프롬프트 다시 빡빡하게
`REVIEW_SYSTEM_PROMPT`를 다음 기준으로 재작성:
- 허용 브랜드: **Scripic / 스크립픽 / ince.lovable.app** 만.
- "Memory Weaver / 메모리위버 / AI 앨범 만들기앱" 같은 **구 브랜드/일반 명칭만 보이는 경우는 명시적으로 거부**하고, reason에 "이 앱의 현재 브랜드(Scripic / 스크립픽 / ince.lovable.app)가 보이지 않아요"라고 안내.
- 단순 앱 스크린샷 단독(소셜 게시 맥락 없음)도 거부.
- 응답은 기존 `{ approved, reason, success_message }` JSON 형식 유지.
- 추가 안전장치: 서버에서 파싱 후, `approved===true`라도 OCR/AI가 추출한 reason 안에 "memory weaver"가 보이고 "scripic"이 보이지 않으면 서버 측에서 한 번 더 reject(이중 가드).

### D. 검증
- 배포 후, 동일 계정 두 기기에서:
  - 기기 A에서 앨범 1개 만들고 후기 보너스 받기 → 기기 B에서 첫 앨범이 정상적으로 만들어지는지(이전엔 막힘).
- 일부러 Memory Weaver 스크린샷 업로드 → 거부 + 안내 메시지 노출.
- `generateAlbum` 호출 시 (가능하면 강제 429 시뮬레이션, 어렵다면 로그 확인) "AI가 많이 붐벼요" 메시지가 나오고 일일 카운트는 그대로인지 확인.

## 기술 메모 (내부용)
- `daily_limits` 문서 키 스킴이 `app:` → `dev:`로 바뀌면 **기존 문서들은 그대로 두고 새 키로 신규 생성**. 마이그레이션 불필요(자정 기준 리셋이라 자연 정리됨). 단, 오늘 기기 A에서 받은 보너스는 키 변경 후 사라진 것처럼 보일 수 있음을 인지.
- Gemini 429는 보통 프로젝트 단위 분당 토큰/요청 한도. 코드 레벨에서 우회는 불가하고, UX와 카운터 보존만 정리.
- 프롬프트 강화 시에도 모델이 종종 친절하게 approve할 수 있으니, 서버측 후처리 가드(브랜드 토큰 검사)를 같이 두는 게 안전.
