
# 이스터에그 비밀번호 게이트 + 일일 앨범 한도 초기화

## 1. 서버 (`functions/src/index.ts`)

기존 콜러블(`dailyStatus`, `grantReviewReward`) 패턴을 그대로 따라 새 콜러블 `resetDailyAlbumLimit`를 추가한다.

- 최상단에 시크릿 선언 추가:
  ```ts
  const EASTER_EGG_ANSWER = defineSecret("EASTER_EGG_ANSWER");
  ```
- `import { createHash, timingSafeEqual } from "crypto";` 추가.
- `onCall({ enforceAppCheck: true, secrets: [EASTER_EGG_ANSWER] }, async (req) => { ... })`.
- 요청 데이터에서 `answer: string`, `clientDate: string`, (rateLimitKey용) `deviceId?: string`를 받는다.
  - `answer` 미존재 또는 문자열 아님 → `invalid-argument`.
  - `answer.length > 200` 하드 리밋.
- `const key = rateLimitKey(req);`
- `const today = validateClientDate(clientDate);`
- **잠금 로직**: `easter_egg_attempts/{key}` 문서를 트랜잭션으로 읽어 `windowStart`(첫 시도 시각)와 `failCount` 관리.
  - 현재 시각 기준 60초 이내이고 `failCount >= 3` 이면 `permission-denied "invalid_answer"` 즉시 반환(성공/실패 사유를 노출하지 않기 위해 동일 코드/메시지).
  - 60초 창이 지났으면 windowStart와 failCount를 초기화.
- **정답 비교(타이밍 세이프)**:
  - `const provided = String(answer).trim().toLowerCase();`
  - `const expected = EASTER_EGG_ANSWER.value().trim().toLowerCase();`
  - 두 문자열을 각각 SHA-256으로 해시(길이 통일) → `timingSafeEqual(Buffer, Buffer)`. 이렇게 하면 원문 길이 차이도 노출되지 않는다.
- 실패 시:
  - `easter_egg_attempts/{key}` 트랜잭션으로 `failCount` 증가(없으면 windowStart=now, failCount=1), `updatedAt` 갱신.
  - `throw new HttpsError("permission-denied", "invalid_answer");`
- 성공 시:
  - `easter_egg_attempts/{key}` 문서 delete(선택) 또는 failCount 리셋.
  - `daily_limits/{key}` 문서를 트랜잭션으로 `.set({ lastDate: today, count: 0, bonusGranted: false, updatedAt: FieldValue.serverTimestamp() }, { merge: false })`.
  - `return { success: true };`
- 로깅은 기존 함수 스타일로 `[easter] ok/fail key=... elapsedMs=...` 정도만 남기고 정답/시크릿 자체는 절대 로그에 포함하지 않는다.

배포는 기존 GitHub Actions workflow에서 함수명을 추가하거나 수동 배포 안내(계획 범위 밖) — 코드만 추가한다. 시크릿(`EASTER_EGG_ANSWER`)은 사용자가 `firebase functions:secrets:set EASTER_EGG_ANSWER`로 별도 설정해야 한다는 점만 안내한다.

## 2. 클라이언트 (`src/routes/easter.tsx`)

기존 콘텐츠는 그대로 두고, 진입 시 게이트를 먼저 렌더한다.

- 상단 상태: `const [unlocked, setUnlocked] = useState(false);`, `const [pw, setPw] = useState("");`, `const [submitting, setSubmitting] = useState(false);`.
- `unlocked === false`일 때는 배경(gradient-warm)과 뒤로가기 버튼은 그대로 두고, 중앙에 카드 UI:
  - 질문: **"세상에서 누가 제일 예쁜가?"**
  - `<input type="password" value={pw} ... />` (자동완성 off, 엔터 = 제출)
  - 확인 버튼 (`disabled={submitting || !pw.trim()}`)
- 제출 핸들러:
  ```ts
  import { httpsCallable } from "firebase/functions";
  import { getFns } from "@/integrations/firebase/client";
  import { getDeviceId, getLocalDate } from "@/lib/dailyLimit";
  import { toast } from "sonner";

  const call = httpsCallable(getFns(), "resetDailyAlbumLimit");
  await call({ answer: pw, clientDate: getLocalDate(), deviceId: getDeviceId() });
  ```
  - 성공 → `setUnlocked(true)` (토스트 없음), `pw` 초기화.
  - 실패(에러 코드 상관없이) → 동일 문구 토스트 `"답이 틀렸어요"` (i18n 불필요, 단일 문구). `pw` 초기화 후 페이지 유지.
- `unlocked === true`일 때 기존 하트/문구 컴포넌트를 그대로 렌더(기존 애니메이션 트리거는 unlock 이후 시작되도록 `show` state를 unlock 시점에 다시 세팅).

## 3. Firestore 규칙 (`firestore.rules`)

`easter_egg_attempts` 컬렉션은 서버(Admin SDK)만 접근하므로 별도 규칙 추가 불필요(기본 규칙이 클라이언트 접근 차단).

## 노출/보안

- 시크릿 값은 서버 시크릿(`EASTER_EGG_ANSWER`)에만 존재, 번들·로그·에러 메시지 어디에도 나타나지 않는다.
- 실패 사유(잘못된 답 vs 잠금)는 클라이언트에서 구분 불가 — 동일 코드/메시지 사용.
- 성공 후에도 세션 저장 없음(새로고침하면 다시 게이트).

## 파일 목록

- 수정: `functions/src/index.ts`
- 수정: `src/routes/easter.tsx`
- (안내) `firebase functions:secrets:set EASTER_EGG_ANSWER` 한 번 실행 및 함수 배포 필요
