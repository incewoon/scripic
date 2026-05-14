# 후기 보상 기능 (Share Review → +1 Album Today)

## 동작 흐름
1. 사용자가 오늘 이미 1개 앨범을 만들어 일일 한도에 걸리면, 기존 "하루 1개" 다이얼로그에 **"후기 올리고 +1개 더 만들기"** 버튼 추가
2. 버튼을 누르면 후기 스크린샷 1장 업로드 화면 표시
3. AI(Gemini Vision)가 스크린샷을 검증 → 통과 시 오늘 하루 추가 앨범 1개 지급
4. 추가 1회는 하루 1번만 사용 가능 (다음날 자정 초기화)

## 변경/추가 파일

### 1. `src/lib/dailyLimit.ts` — 추가 보상 로직
- `EXTRA_KEY = "moara_extra_album_date"` 추가
- 새 함수:
  - `hasExtraGrantedToday()` — 오늘 이미 보상을 받았는지
  - `grantExtraAlbumToday()` — 오늘 보상 1회 지급 표시
  - `canCreateAlbumToday()` 수정: 기본 1개 사용했어도 `hasExtraGrantedToday()` && 추가분 미사용이면 `true`
  - 추가분 사용 추적용 `EXTRA_USED_KEY = "moara_extra_album_used_date"` + `markAlbumCreatedToday()`에서 분기 처리

### 2. `src/lib/i18n.ts` — 한/영 문구 추가
- `reviewRewardCta`: "후기 올리고 +1개 더 만들기"
- `reviewRewardTitle`: "후기 스크린샷을 올려주세요"
- `reviewRewardDesc`: "Instagram, Facebook, Threads, X 등에 올린 Memory Weaver 후기 화면을 캡처해서 올려주세요. AI가 확인 후 오늘 추가 앨범 1개를 드려요."
- `reviewRewardPickImage`, `reviewRewardChecking`, `reviewRewardRejected`, `reviewRewardAlreadyUsed` 등

### 3. `src/components/ReviewRewardDialog.tsx` (신규)
- 이미지 1장 선택 → 미리보기
- "검증 요청" 버튼 → 서버 함수 호출
- 응답에 따라:
  - `approved=true`: success_message 토스트 + `grantExtraAlbumToday()` + 다이얼로그 닫고 `/create`로 이동
  - `approved=false`: reason 표시, 재시도 가능
  - `daily_limit_info` 있을 때(이미 사용): 안내 후 닫기

### 4. `src/lib/reviewReward.functions.ts` (신규, TanStack Server Function)
- `verifyReviewScreenshot` — `createServerFn({ method: "POST" })`
- 입력(zod): `{ imageDataUrl: string, dailyExtraUsedToday: boolean }`
- 처리:
  - Lovable AI Gateway 호출 (`google/gemini-2.5-flash`, vision)
  - 시스템 프롬프트 = 사용자가 제공한 Reward System Agent 프롬프트 전문
  - 사용자 메시지 = `{ daily_extra_used_today }` JSON + 이미지 첨부
  - `response_format: { type: "json_object" }`로 JSON 강제
  - 응답 파싱 후 그대로 반환 (`approved/reason/confidence/success_message/daily_limit_info`)
  - 429/402 에러는 사용자 친화 문구로 변환

### 5. `src/components/StorageNoticeDialog.tsx` 형제 — `DailyLimitDialog` 위치
- 현재 코드: `src/routes/index.tsx`에서 `dailyLimit` 안내 다이얼로그 사용 중
- 그 다이얼로그 안에 `reviewRewardCta` 버튼을 추가하여 `ReviewRewardDialog` 열기
- 추가분도 이미 사용했으면 버튼 숨김

### 6. `src/routes/index.tsx` & `src/routes/create.tsx`
- `canCreateAlbumToday()` 호출부는 그대로지만, 새 다이얼로그/버튼 wiring
- `markAlbumCreatedToday()` 호출 시 보상분 사용으로 카운트되도록 분기

## 보안 / 키
- LOVABLE_API_KEY 사용 (이미 Cloud에 자동 주입). 추가 secret 필요 없음.
- 클라이언트에서 직접 Gateway 호출 금지 → 반드시 서버 함수 경유.
- 일일 한도/보상 사용 여부는 클라이언트(localStorage) 기반(현재 앱과 동일한 정책). 서버 검증은 이미지 진위만 담당.

## 사용 모델
- `google/gemini-2.5-flash` (이미지+텍스트, 빠르고 저렴)

## 위험/주의
- 사용자가 localStorage를 지우면 보상 재시도 가능 — 기존 1일 1개 정책과 동일한 한계, 별도 서버 카운터는 추후 작업.
- 이미지 업로드 크기 제한: 클라이언트에서 1024px 리사이즈 후 jpeg base64 전송으로 페이로드 절감.
