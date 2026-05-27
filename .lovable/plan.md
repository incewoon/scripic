# Supabase → Firebase 완전 통합 이전 계획

## 현재 상태 요약

이미 Firebase 쪽 자산이 상당히 완성되어 있습니다:
- `functions/src/index.ts` — `chat`, `generateAlbum` callable이 **App Check 강제 + Firestore 일일 한도 트랜잭션 + Gemini Secret** 까지 갖춰져 있음
- `firestore.rules` — 클라이언트 모든 읽기/쓰기 deny, 서버(Admin SDK)만 접근
- `src/integrations/firebase/auth.ts` — 익명 로그인 싱글톤

남은 작업은 (1) 클라이언트가 Supabase Edge Function 대신 Firebase callable을 호출하게 바꾸고, (2) Supabase 의존 코드/파일/테이블/Edge Function/Secret을 제거하는 것입니다.

---

## 1단계: 클라이언트를 Firebase Callable로 전환

### 1.1 Firebase SDK 모듈 추가 (`src/integrations/firebase/functions.ts` 신규)
- `getFunctions(getFirebase(), "us-central1")` 싱글톤
- App Check 초기화(`initializeAppCheck` + ReCaptcha v3 또는 Play Integrity는 추후, 우선 debug token 흐름 유지)
- `httpsCallable<TReq, TRes>(name)` 래퍼 export

### 1.2 `src/lib/gemini.ts` 재작성
- 기존 `callGeminiProxy(messages, systemInstruction)` 시그니처는 유지하되 내부를 **`httpsCallable("chat" | "generateAlbum")`** 호출로 바꿈
- 익명 로그인은 호출 직전 `ensureFirebaseUser()`로 보장 (App Check가 인증을 대체하므로 ID token은 자동 첨부됨)
- 에러 매핑: `resource-exhausted` → "오늘의 앨범 한도에 도달했어요", `failed-precondition` → "기기 인증에 실패했어요"

### 1.3 `src/lib/aiClient.ts` 조정
- `aiChatStream`은 현재 단발 호출이므로 그대로 두되 callable 두 가지를 분기:
  - 채팅 턴 → `chat` callable
  - 앨범 생성 → `generateAlbum` callable (현재 chatTranscript+system+user를 합쳐 callable이 요구하는 입력 형태로 변환)
- 시스템 프롬프트는 **서버(`functions/src/prompts-*`)에서 이미 조립**하므로 클라이언트에서 중복 전송 제거 → `src/lib/prompts-chat.ts`, `src/lib/prompts-album.ts` 삭제

### 1.4 `src/lib/dailyLimit.ts` 단순화
- 일일 한도 권위(authoritative)는 이제 Firestore + Cloud Function `reserveDailyAlbum`
- localStorage 캐시는 UX(버튼 비활성화 등)용으로만 유지
- `canCreateAlbumToday()`는 낙관적 가드만, 실제 한도 초과는 callable의 `resource-exhausted` 에러로 처리

---

## 2단계: Supabase 의존 제거

### 2.1 코드 제거
| 파일 | 처리 |
|---|---|
| `src/lib/reminders.ts` | profiles 테이블 의존. 알림 활성 여부는 localStorage로 이전하거나 Firestore `users/{uid}/profile` 문서로 이전 (택일 — 본 계획은 localStorage 이전 권장: 디바이스 단위 익명 사용자 모델과 일치) |
| `src/lib/reviewReward.functions.ts` | TanStack server fn 삭제, 대신 Cloud Function `grantReviewReward` (callable)로 이전. Firestore `daily_limits/{key}` 문서에 `bonusGranted: true` 플래그를 추가해 한도 한 번 더 허용 |
| `src/components/ReviewRewardDialog.tsx` | 위 callable 사용으로 교체 |
| `src/integrations/lovable/index.ts` | 사용처 없으면 삭제 (Google OAuth 브로커 — 익명 인증만 쓰므로 불필요) |

### 2.2 Supabase Edge Function & 설정 제거
- `supabase/functions/gemini-proxy/` 디렉토리 삭제
- `supabase--delete_edge_functions(["gemini-proxy"])` 호출
- `supabase/config.toml`에서 `[functions.gemini-proxy]` 블록 제거
- Supabase Secret `GEMINI_API_KEY`, `FIREBASE_SERVICE_ACCOUNT`, `FIREBASE_WEB_API_KEY` 삭제 (Firebase Functions secret으로만 관리)

### 2.3 Supabase 테이블/RLS/RPC 정리 (마이그레이션)
- `DROP TABLE public.purchases;`
- `DROP TABLE public.profiles;`
- `DROP FUNCTION` : `consume_album_credit`, `add_album_credits`, `activate_subscription`, `handle_new_user`, `prevent_profile_privilege_escalation`
- 미사용이라 데이터 손실 없음 (사용자 확인됨)

### 2.4 Supabase 클라이언트 파일은 그대로 유지
- `src/integrations/supabase/*` 는 자동 생성 파일이라 **삭제하지 않음** (Lovable Cloud가 재생성). 다만 앱 코드에서 import 0건이 되도록 함 → 빌드에는 포함되지 않음
- TanStack `attachSupabaseAuth` 미들웨어는 `src/start.ts`에서 제거 (Supabase 인증 미사용)

---

## 3단계: Cloud Functions 보강

### 3.1 신규 callable `grantReviewReward`
- App Check 강제
- `daily_limits/{key}` 문서에 `bonusGranted: true`, `bonusGrantedAt` 기록
- 클라이언트가 SNS 리뷰 스크린샷 검증 후 호출 (검증 자체는 클라이언트 신뢰 — 추후 Vision API로 강화 가능)

### 3.2 `reserveDailyAlbum` 보강
- 기존: 1회/일 제한
- 변경: `bonusGranted === true`면 카운트 2까지 허용

### 3.3 App Check 설정 확인
- `functions/src/index.ts`는 이미 `enforceAppCheck: true`
- 클라이언트 `firebase/functions.ts`에서 dev 환경 debug token 활성화 코드 추가 필요

---

## 4단계: 환경변수 / 문서 정리

- `.env`는 Lovable이 자동 관리(Supabase 키 자동 주입). **건드리지 않음**
- 새 Firebase 클라이언트 설정은 기존 `src/integrations/firebase/client.ts`를 그대로 사용
- `FIREBASE_SETUP.md` 갱신: Supabase 언급 제거, App Check 등록 절차 명시

---

## 5단계: 보안 메모리 갱신

`security--update_memory` 호출:
- 앱이 더 이상 Supabase Auth/DB/Storage를 사용하지 않으며, 모든 백엔드 로직은 Firebase (Auth + Firestore + Functions w/ App Check)로 처리됨을 명시
- profiles/purchases 테이블 및 관련 RPC가 삭제되었음을 기록

---

## 기술 세부 (실행 순서)

```text
1. functions/src/index.ts 에 grantReviewReward 추가 + reserveDailyAlbum 보너스 처리
2. src/integrations/firebase/functions.ts 신규
3. src/lib/gemini.ts 재작성 → httpsCallable("chat") 사용
4. src/lib/aiClient.ts 조정 (앨범 생성은 generateAlbum callable로 분기)
5. src/lib/prompts-chat.ts, src/lib/prompts-album.ts 삭제 (서버 권위)
6. src/lib/dailyLimit.ts 단순화 (캐시 전용)
7. src/components/ReviewRewardDialog.tsx → callable로 교체
8. src/lib/reviewReward.functions.ts 삭제
9. src/lib/reminders.ts → localStorage 기반으로 재작성
10. src/start.ts 에서 attachSupabaseAuth 제거
11. supabase/functions/gemini-proxy/ 삭제 + delete_edge_functions 호출
12. supabase/config.toml 의 [functions.gemini-proxy] 제거
13. Supabase migration: DROP tables/functions/policies
14. Supabase secrets 정리 (GEMINI/FIREBASE 관련 3개 delete)
15. security--update_memory 갱신
16. 빌드 확인 → rg "supabase" src 결과가 자동생성 파일만 남는지 검증
```

## 주의/리스크

- **App Check**: production에서 정상 동작하려면 Firebase Console에서 ReCaptcha v3 site key 등록이 필요. 미등록 시 모든 callable이 401. 본 계획은 코드 준비만 하고, site key 등록은 별도 안내.
- **Cloud Functions 배포**: 본 환경에선 Cloud Functions를 자동 배포할 수 없음 → 사용자가 `firebase deploy --only functions` 수동 실행 필요. 이전 직후 첫 호출 전 반드시 배포.
- **Supabase 자동 재생성**: Lovable Cloud가 활성화된 동안 `src/integrations/supabase/*` 파일과 `.env`의 SUPABASE 키는 자동 재생성됨. 앱 코드에서 import만 하지 않으면 무해.
