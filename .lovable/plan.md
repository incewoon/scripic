## 점검 결과

### 1. "하루 1개 고정" 테스트 코드는 없음 ✅

`functions/src/index.ts`의 `reserveDailyAlbum`(L69-89)을 확인했습니다:

```
const bonusToday = sameDay && data?.bonusGranted === true;
const limit = bonusToday ? 2 : 1;
```

즉, `daily_limits/{key}.bonusGranted === true`이면 한도가 자동으로 2로 올라갑니다. 클라이언트 측 `dailyLimit.ts`도 `hasExtraGrantedToday() && !hasExtraUsedToday()`로 보너스를 정상 반영합니다. **하드코딩된 "1개 고정" 잔재 없음.**

### 2. 진짜 원인 = `grantReviewReward` 실패 → 일반 에러 메시지로 폴백

`ReviewRewardDialog.tsx`의 분기:
- `approved === true` → 성공 메시지
- `daily_limit_info` 있음 → "이미 사용" 안내
- 그 외 → `result.reason || t.reviewRewardError` 노출
- 예외 throw → catch에서 `t.reviewRewardError` ("확인하지 못했어요...")

사용자가 보는 메시지가 정확히 한국어 `reviewRewardError`이므로 **catch 경로**일 가능성이 가장 높습니다. 즉 서버에서 `HttpsError("internal", "verification_failed: ...")`가 던져지고 있습니다 (L370). 가능한 트리거:

- **a)** Gemini가 ```json … ``` 외 다른 prefix(설명문)를 붙여 `JSON.parse` 실패
- **b)** `gemini-2.5-flash-lite`가 스크린샷 이미지를 거부하거나 빈 응답을 반환
- **c)** 프롬프트가 매우 엄격함: "Scripic / photo album / memory album / ai album / script pic / 사진 한 장 한 장에 이야기를" 키워드를 **명시적으로** 요구. 한국 SNS 후기에 'Scripic'이라는 영문 브랜드명이 안 들어가면 approved=false. 이 경우엔 `result.reason`(영문)이 표시돼야 정상인데, JSON 파싱 실패면 catch 폴백으로 한국어 에러가 나옵니다.

또한 클라이언트가 `approved=false` 경로를 받아도 `result.reason`이 비어있으면 같은 한국어 에러가 표시됩니다.

### 3. 또 하나의 잠재 이슈

`ensureFirebaseUser()`만 호출하고 App Check 토큰이 안 잡히면 `rateLimitKey`에서 `failed-precondition`을 던질 수 있습니다 — 이것도 catch 경로로 같은 메시지를 보여줍니다.

---

## 수정 계획

### A. 서버 로깅 추가 (`functions/src/index.ts`, `grantReviewReward`)

- Gemini 호출 전후로 `console.log("[reviewReward] raw text:", text.slice(0,500))` 기록
- JSON parse 실패 시 raw text와 cleaned text를 함께 로그
- 이미지 mime/길이도 로그

→ 배포 후 Firebase Functions 로그에서 실제 응답을 확인하면 (a)/(b)/(c) 중 무엇인지 즉시 판별 가능.

### B. 클라이언트 에러 메시지 세분화 (`ReviewRewardDialog.tsx`)

`onSubmit` catch에서 `e.code`별로 다른 안내:
- `functions/internal` & message가 `verification_failed`로 시작 → "AI 검증 중 일시 오류가 발생했어요. 잠시 후 다시 시도해주세요."
- `functions/failed-precondition` → "디바이스 인증이 아직 준비되지 않았어요. 잠시 후 다시 시도해주세요."
- 기존 `resource-exhausted` → 그대로
- 그 외 → 기존 메시지

→ 사용자가 보는 메시지로 원인을 즉시 좁힐 수 있게 됨.

### C. 서버 파싱 견고화 (`grantReviewReward`)

- ```json/``` 외에 첫 `{` ~ 마지막 `}` 슬라이스로 fallback parsing
- 파싱 완전 실패 시 `internal` 대신 `{ approved:false, reason:"AI 응답을 해석하지 못했어요." }` 로 반환 → 한국어 친화 메시지가 그대로 사용자에게 노출
- `parsed.reason`이 비어 있을 때 클라이언트 폴백 메시지("후기 내용을 인식하지 못했어요. 'Scripic'이라는 단어가 보이게 캡처해보세요.")로 안내 강화

### D. 프롬프트 완화 (선택, B/C 로그로 (c)가 확정되면 적용)

REVIEW_SYSTEM_PROMPT의 승인 기준에 "한글로 'Scripic', '스크리픽', '사진 앨범 앱', 'AI 앨범' 등을 언급한 경우" 명시. 다만 너무 느슨하면 누구나 받을 수 있으니 로그 확인 후 결정.

---

## 작업 순서

1. **A + B + C** 를 함께 적용 (코드 수정만, 동작 변경 없음 → 안전)
2. Firebase Functions 배포(`firebase deploy --only functions:grantReviewReward`)는 사용자가 직접 진행
3. 실제 스크린샷 1~2회 시도 후 로그 확인 → 필요 시 **D** 적용

배포 명령은 별도 진행이 필요하다는 점, 그리고 로그 확인 후 D가 필요한지 결정한다는 점만 양해 부탁드립니다.