# 앨범 한도 UX 안내 (첫날 3 / 이후 1 / 후기 +1)

서버 로직은 손대지 않고 UI·i18n·클라이언트 헬퍼만 수정합니다.

## 1. 헬퍼 (src/lib/dailyLimit.ts)
읽기 전용 export 추가 (한도 계산 로직 변경 없음):
- `getDailyLimitSnapshot(): { used, limit } | null` — 오늘자 `moara_daily_*` 캐시가 있으면 반환, 없으면 null
- `isWelcomeDayLimit(limit: number)` — `limit >= 3`
- `wasLastSlotJustUsed()` — 스냅샷 기준 `used >= limit`

`markAlbumCreatedToday()`는 낙관적 +1 후 `{ used, limit } | null`을 반환하도록만 확장(기존 호출부 영향 없음). `syncDailyLimitFromServer` 동작 유지.

## 2. i18n (src/lib/i18n.ts) — en/ko 동일 키
신규: `dailyLimitTitleNormal`, `dailyLimitBodyNormal`, `dailyLimitTitleWelcome`, `dailyLimitBodyWelcome`, `welcomeLimitTitle`, `welcomeLimitBody`, `welcomeLimitOk`, `dailyLimitLastSlotToastWelcome`, `dailyLimitLastSlotToastNormal` (문구는 요청안 그대로).

기존 `dailyLimitTitle` / `dailyLimitBody` / `dailyLimitNextAt`는 남겨 두고(chat.tsx 에러 토스트가 `dailyLimitBody`를 사용), `freeNoticeBody`·`freeNoticeSoon`의 "하루 1개" 단정 문구를 "첫날 최대 3개 / 이후 하루 1개 / 후기 +1 / 앨범당 사진 3장"으로 갱신. `reviewReward*`는 유지.

## 3. 한도 모달 분기 (src/routes/index.tsx)
`limitOpen` 모달에서 `getDailyLimitSnapshot()`을 읽어
- `isWelcomeDayLimit(limit)` → Welcome 제목/본문
- 아니면(또는 스냅샷 없음) → Normal 제목/본문

`dailyLimitNextAt`, `reviewRewardCta`(`!hasExtraUsedToday()`), 확인 버튼, `showLimit` 딥링크 트리거는 그대로.

## 4. 1회성 환영 안내
`src/components/WelcomeLimitDialog.tsx` 신규 (StorageNoticeDialog 패턴). 플래그 `scripic_welcome_limit_notice_v1`.

Home에서 아래를 모두 만족할 때만 1회 표시:
1. 플래그 `scripic_welcome_limit_notice_v1` 없음
2. StorageNoticeDialog가 열려 있지 않음(열려 있으면 닫힌 뒤 재평가)
3. Home 마운트 후 `await syncDailyLimitFromServer()` 완료 이후
4. `getDailyLimitSnapshot()?.limit >= 3`

limit < 3 이거나 스냅샷이 null이면 표시하지 않는다(2일차 오노출 방지). 닫을 때 플래그 저장.

## 5. 마지막 슬롯 토스트 (src/routes/chat.tsx)
생성 성공 경로에서 `markAlbumCreatedToday()` 반환 스냅샷으로 `used >= limit`일 때 1회 토스트:
`limit >= 3` → Welcome 문구, 아니면 Normal 문구. 기존 `t.completed` 성공 토스트와 겹치지 않게 짧은 delay 후 표시.

반환이 null이면, 이어지는 `syncDailyLimitFromServer()` 직후 `getDailyLimitSnapshot()`으로 동일 규칙 재판정. 이미 토스트를 띄웠으면 중복 금지(로컬 플래그로 가드).

## 변경 파일
- `src/lib/dailyLimit.ts`
- `src/lib/i18n.ts`
- `src/routes/index.tsx`
- `src/routes/chat.tsx`
- `src/components/WelcomeLimitDialog.tsx` (신규)

## 검증
신규 설치 시 환영 안내 1회만 노출 / 첫날 소진 모달 = Welcome / 평일 소진 모달 = Normal / 마지막 슬롯에서만 토스트 / en·ko 키 누락 없음.
- 설치 2일차(firstSeenDate가 어제)에 앱을 열면 환영 안내가 뜨지 않을 것
- 신규·재설치 후 sync로 limit=3이 된 뒤에만 환영 안내가 1회 뜰 것
