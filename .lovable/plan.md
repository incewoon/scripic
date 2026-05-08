## 전면 무료 + 로그인 제거 + 백업 암호화 + 일일 제한 (Firebase 프록시 대비)

### 1) 유료 요소 전면 제거

**삭제할 파일**
- `src/components/Paywall.tsx`
- `src/lib/billing.ts`
- `src/lib/premium.ts`

**관련 코드 정리**
- `src/routes/__root.tsx`: `installBillingBridge`, `restore` import/호출 제거
- `src/routes/index.tsx`: Paywall, 뱃지(무료/유료/구독), `5/5` 카운터, paywall 큐 로직 등 모두 제거
- `src/routes/create.tsx`: Paywall, premium 분기, `FREE_PHOTO_MAX/PAID_PHOTO_MAX` → 단일 상수 `PHOTO_MAX = 3`로 통일
- `src/routes/chat.tsx`: premium 분기 제거, AI 응대 횟수는 사진당 3회로 통일 (전원 동일)
- `src/routes/settings.tsx`: Purchases 섹션, Account 섹션, Paywall, restorePurchases 제거 → Theme + Backup 만 남김
- `supabase/functions/chat/index.ts`: 클라이언트는 항상 `maxTurnsPerPhoto = 3` 전송 (서버 cap 그대로)
- `src/lib/i18n.ts`: 결제/구독/뱃지/한도 관련 키 정리

`profiles.album_credits` / `is_subscribed` / `purchases` 테이블은 DB에 남겨두되 코드에서 더 이상 사용하지 않음.

### 2) 로그인 정책 제거

**삭제할 파일**
- `src/lib/auth.tsx`
- `src/routes/auth.tsx`

**정리**
- `src/routes/__root.tsx`: `AuthProvider` 제거
- `src/lib/storage.ts`: `setStorageUserId`, account 키, 게스트 마이그레이션 로직 제거 → 단일 키 `memori_albums_v1`만 사용
- `src/routes/index.tsx`, `album.$id.tsx`, `chat.tsx`, `create.tsx`: `useAuth` import/사용 제거, 로그인/로그아웃 버튼/링크 모두 제거
- 알림 토글은 서버 저장이라 의존성 큼 → 제거 (요구사항 “별도 계정체크 없음”에 부합)

Supabase 클라이언트 자체는 chat / generate-album edge function 호출용으로 anon key로 계속 사용. (단, 곧 Firebase 프록시로 전환할 준비를 함 — 아래 5번 항목)

### 3) 일일 앨범 생성 제한 (하루 1개)

**클라이언트 검사 (1차 방어선)**
- 새 모듈 `src/lib/dailyLimit.ts`
  - `getLastAlbumDate(): string | null` — localStorage `moara_last_album_date` (YYYY-MM-DD, 로컬 타임존)
  - `canCreateAlbumToday(): boolean`
  - `markAlbumCreatedToday(): void`
- `src/routes/index.tsx`의 `onCreate` / `src/routes/create.tsx` 진입 시 검사 → 이미 만들었으면 토스트 + 모달로 차단
- 새 i18n 키: `dailyLimitTitle`, `dailyLimitBody`, `dailyLimitNextAt`
- 앨범 저장 성공 시 (`saveAlbum` 직후, chat.tsx의 finalize 흐름) `markAlbumCreatedToday()` 호출

**서버 검사 (Firebase 프록시 후 강한 방어선)**
- 5번 Firebase 프록시 단계에서 동일한 제한을 서버 측에서도 강제 (디바이스 ID + 일자 키)
- 디바이스 ID: `moara_device_id` (UUID, localStorage에 한 번 생성 후 영구 저장) — 로그인 없이 식별

### 4) 업로드 사진 제한 (한 번에 3장)

- `src/routes/create.tsx`:
  - `PHOTO_MAX = 3` 상수
  - 파일 선택 핸들러에서 `selected.length + existing.length > 3`이면 잘라내고 토스트 안내
  - 추가 버튼은 3장 도달 시 비활성화

### 5) 백업 암호화 — 4자리 PIN

`src/lib/backup.ts` 전면 개편:

- `exportBackupZip(pin: string)`:
  - 기존 zip을 만든 뒤 → AES-GCM으로 암호화
  - 키 유도: PBKDF2-SHA256, 200,000회, 16-byte salt
  - 컨테이너 zip 구조:
    - `meta.json`: `{ app:"moara", v:2, kdf:"PBKDF2-SHA256", iter:200000, salt:<base64>, iv:<base64> }`
    - `payload.enc`: 암호화된 내부 zip 바이트
  - 파일명: `moara-backup-YYYYMMDD-HHMM.moarabak`
- `importBackupZip(file, pin)`:
  - meta.json 읽고 PBKDF2 키 유도 → AES-GCM 복호화 → 내부 zip 풀어 앨범 복원
  - 복호화 실패 → `wrong_password` 반환
- 소유자/userId/계정 매칭 코드 전부 삭제, FREE_LIMIT 분기 삭제

**UI (`src/routes/settings.tsx`)**
- 신규 컴포넌트 `BackupPinDialog`:
  - 내보내기: 4자리 숫자 입력 + 확인용 재입력 → 일치 검증
  - 복원: 파일 선택 → 4자리 숫자 입력 → 복호화 시도
  - 입력 필드: `inputMode="numeric"`, `maxLength=4`, 숫자만 허용
- i18n 키: `backupPinTitle`, `backupPinHint`, `backupPinConfirm`, `backupPinMismatch`, `backupPinWrong`, `backupPinFormat`

### 6) Firebase 프록시 대비 (Gemini API 직결 미리 준비)

지금 Firebase 프로젝트 자격증명이 없으므로 **이번 변경에서 즉시 마이그레이션은 하지 않음**. 다만 “나중에 갈아끼우기 쉽게” 다음을 정리:

- 새 모듈 `src/lib/aiClient.ts` 신설 — 모든 AI 호출 (현재 `chat`/`generate-album` Supabase edge function)을 단일 함수로 감쌈:
  ```text
  type AiCall = (path: "chat" | "generate-album", body: unknown) => Promise<Response>
  ```
  - 현재 구현: `${VITE_SUPABASE_URL}/functions/v1/<path>`
  - 미래 구현: `${VITE_AI_PROXY_URL}/<path>` (Firebase Functions 엔드포인트, Bearer는 디바이스 ID + HMAC)
- `src/routes/chat.tsx`, `src/routes/create.tsx`의 fetch들을 모두 `aiClient`를 거치도록 교체
- 제한 검사 (일일 앨범 1개)도 동일하게 `aiClient`/`limitsClient` 인터페이스로 추상화 → 나중에 Firebase Firestore 기반 서버 카운팅으로 자연스럽게 교체 가능

**Firebase로 전환할 때 필요한 것 (이번엔 만들지 않음, 메모용)**
1. Firebase 프로젝트 + Functions 활성화 + Firestore 활성화
2. 네 명의의 Gemini API Key를 Firebase Functions 환경 변수로 저장
3. `https://<your-region>-<project>.cloudfunctions.net/api`에 다음 엔드포인트:
   - `POST /chat` — Gemini로 프록시
   - `POST /generate-album` — Gemini로 프록시
   - `POST /limits/check-and-bump` — `{deviceId, kind:"album"}` → 오늘 1개 초과면 429
4. App Check (reCAPTCHA v3) 또는 디바이스 HMAC으로 호출자 검증
5. `.env`에 `VITE_AI_PROXY_URL` 추가 → `aiClient.ts`가 자동으로 그쪽으로 보냄

준비가 되면 “Firebase 프록시 켜줘”라고만 말씀하시면 됩니다.

### 7) 라우트/타입 정리

- `routeTree.gen.ts`는 자동 갱신 (직접 수정 X)
- 삭제되는 라우트: `/auth` — 자동으로 트리에서 빠짐
- 삭제 모듈을 import하던 모든 파일에서 import 제거

### 영향 요약

- 누구나 무료, 무로그인
- 하루 1개 앨범 (클라 기준 — Firebase 전환 후 서버 강제)
- 업로드 한 번에 최대 3장
- AI 대화 사진당 최대 3회
- 백업 파일은 4자리 PIN으로 AES-GCM 암호화 (PIN 분실 시 복구 불가)
- AI 호출 경로가 `aiClient` 한 곳으로 모여 Firebase 프록시 전환이 한 줄 환경변수 + 어댑터 교체로 가능

### 변경 / 신규 파일

**신규**
- `src/lib/dailyLimit.ts`
- `src/lib/aiClient.ts`
- `src/components/BackupPinDialog.tsx`

**수정**
- `src/routes/__root.tsx`, `src/routes/index.tsx`, `src/routes/create.tsx`, `src/routes/chat.tsx`, `src/routes/album.$id.tsx`, `src/routes/settings.tsx`
- `src/lib/storage.ts`, `src/lib/backup.ts`, `src/lib/i18n.ts`
- `supabase/functions/chat/index.ts` (클라이언트 cap만 영향, 서버 변경 없음)

**삭제**
- `src/lib/auth.tsx`, `src/lib/billing.ts`, `src/lib/premium.ts`
- `src/routes/auth.tsx`
- `src/components/Paywall.tsx`

진행해도 될까요?
