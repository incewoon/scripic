# 설치 당일 앨범 3회 + 후기 보너스 +1 (최대 4)

## 목표
기기 문서가 처음 만들어진 날(firstSeenDate)이 오늘이면 앨범 기본 한도 3회, 같은 날 후기 인증 시 +1 → 최대 4회. 그 외 날짜는 기존과 동일(1, 후기 시 2). 로컬은 서버 used/limit을 그대로 반영해 2·3·4회차 진입이 막히지 않게 한다.

## 서버 (functions/src/index.ts)

### 1. 한도 공식 (두 곳 동일하게)
`reserveDailyAlbum`의 체크부와 `dailyStatus` 반환값 모두:

```ts
const isFirstDay = data?.firstSeenDate === today;
const baseLimit = isFirstDay ? 3 : 1;
const limit = baseLimit + (bonusToday ? 1 : 0);
```

REJECT 로그에 `isFirstDay`, `firstSeenDate`, `limit`을 추가한다.

### 2. firstSeenDate 보존 (set 분기 4곳)
문서를 새로 쓰거나 만들 때 항상 `firstSeenDate: data?.firstSeenDate ?? today`:

1. `reserveChatTurn` — sameDay=false 분기 (merge: true 유지)
2. `reserveDailyAlbum` — sameDay=false 분기 (merge: true 추가)
3. `grantDailyBonus` — sameDay=false 분기
4. `resetDailyAlbumLimit` (이스터) — 리셋 전 기존 문서를 읽어 `data?.firstSeenDate ?? today`를 set 페이로드에 포함. count/chatCount/bonusGranted 리셋 동작은 그대로.

sameDay=true인 update 분기는 손대지 않는다.

## 클라이언트 (src/lib/dailyLimit.ts)

- 오늘 날짜 + `used`/`limit`을 localStorage에 캐시하는 키 추가 (`moara_daily_used`, `moara_daily_limit`, `moara_daily_cache_date` 형태).
- `syncDailyLimitFromServer()`가 서버 응답의 used/limit/bonusGranted를 그 캐시에 저장. 기존 KEY/EXTRA_* 미러링도 유지.
- `canCreateAlbumToday()`: 캐시 날짜가 오늘이면 `used < limit`으로 판정, 아니면 기존 로컬 로직(1 + 후기 1)으로 폴백.
- `markAlbumCreatedToday()`: 캐시 used를 +1 (기존 KEY/EXTRA 기록도 유지). 앨범 생성 후 `syncDailyLimitFromServer()`가 이어 호출되어 서버 값으로 재정렬된다.
- `resetDailyAlbumToday()`: 캐시 키도 함께 제거.
- 로컬에 별도 "설치일" 플래그는 만들지 않는다 — 한도의 진실은 서버 limit.

호출부(index.tsx, create.tsx, chat.tsx, deepLink.ts, ReviewRewardDialog.tsx)는 시그니처가 그대로라 수정 없음.

## 검증
설치 당일 3회 연속 생성 → 후기 인증 후 4회차 가능 → 다음날 1(후기 시 2) → 재설치 시 다시 3회 → 이스터 리셋 후 firstSeenDate 유지. dailyStatus.limit과 reserveDailyAlbum 한도 일치 확인.

## 변경 파일
- `functions/src/index.ts`
- `src/lib/dailyLimit.ts`
