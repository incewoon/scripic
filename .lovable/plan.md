## 목표

메인 화면 인증 버튼 오른쪽에 **설정(⚙️)** 아이콘을 추가하고, `/settings` 페이지를 확장해 계정정보·구매내역·앨범 백업/복원을 한 곳에서 관리합니다.

## 1) 메인 화면 — 설정 아이콘 추가

`src/routes/index.tsx`의 인증 영역(189–205행) 바로 옆에 톱니바퀴 버튼 추가. 게스트/로그인 모두 표시(백업/복원은 게스트도 이용 가능, 단 복원 시 계정 매칭 규칙은 아래 참조).

```
[로그인/로그아웃] [⚙️]              [배지] 내 앨범 3/5
```

## 2) `/settings` 페이지 재구성

기존 알림 토글은 유지하고 위에서부터 다음 섹션을 추가합니다.

### A. 내 계정
- **게스트**: "게스트로 사용 중" + [로그인] 버튼
- **로그인**: 표시 이름 / 이메일
  - 구독 중(월간/연간): `구독 중 · 다음 결제(만료) YYYY-MM-DD`
  - 구독 없고 추가 크레딧 있음: `추가 앨범 N개 보유`
  - 그 외: `무료 플랜`
- "무기한" 표기는 사용하지 않음. `subscription_end_date`가 비어 있으면 만료일 자리를 비우고 단순히 `구독 중`으로 표시.

### B. 구매 / 결제
- `purchases` 테이블에서 본인 최근 구매 5건(날짜·상품·금액).
- [구매 복원] — 기존 `restore()` (네이티브 셸이 아닐 땐 비활성 + 안내).
- [플랜 업그레이드] — Paywall 모달.

### C. 앨범 백업 / 복원

앨범은 IndexedDB(`src/lib/storage.ts`)에 있으므로 zip 한 파일로 내보냅니다.

**[백업 파일 다운로드]**
- `getAlbums()`로 전체 앨범 로드.
- JSZip 구조:
  ```
  memori-backup-YYYYMMDD-HHmm.zip
  ├─ manifest.json
  └─ albums/<albumId>/
     ├─ album.json   (제목/소제목/intro/closing/period/location/captions)
     └─ photos/001.jpg, 002.jpg, ...
  ```
- `manifest.json` 필드(스키마 v1, OS 무관 평문 JSON):
  ```json
  {
    "schemaVersion": 1,
    "app": "memori",
    "createdAt": "2026-05-04T...Z",
    "owner": {
      "kind": "user" | "guest",
      "userId": "<uuid|null>",
      "email": "<email|null>"
    },
    "albumCount": 12,
    "albums": [{ "id": "...", "title": "...", "photoCount": 3 }]
  }
  ```
- 사진은 dataURL을 디코드해 실제 jpg/png 바이트로 저장 → 압축 풀면 폴더에서 사진 그대로 열림.
- 파일은 표준 ZIP + 평문 JSON + 표준 이미지 포맷만 사용 → **Android·iOS 어디서 만든 파일이든 동일하게 복원 가능**(아래 호환성 절 참조).

**[백업 파일에서 복원]** — 파일은 사용자가 직접 골라 가져옵니다(자동 가져오기 없음).
- `<input type="file" accept=".zip,application/zip">` 로만 트리거. 어떤 자동 폴더 스캔/연동도 하지 않음.
- 검증 순서:
  1. zip 안에 `manifest.json` 존재 + `app === "memori"` + `schemaVersion <= 1` 확인.
  2. **소유자 매칭 (엄격)**:
     - `manifest.owner.kind === "user"` 인 백업: 현재 로그인한 사용자의 `auth.uid()`가 `manifest.owner.userId`와 **정확히 일치**해야만 복원 허용.
       - 로그인 안 된 상태이거나 다른 계정이면 → 토스트 "이 백업은 다른 계정에서 만들어졌어요. 같은 계정으로 로그인해 주세요." 후 중단.
     - `manifest.owner.kind === "guest"` 인 백업: 현재 게스트(비로그인) 상태에서만 복원 허용. 로그인 상태에서 게스트 백업을 가져오려 하면 → 토스트로 거부 후 중단.
  3. 통과 시 사진 바이트를 dataURL로 다시 변환해 앨범 객체 재구성.
- 충돌: 동일 `id`가 이미 있으면 새 `id`를 발급해 중복 저장 방지.
- 무료 한도(`FREE_LIMIT=5`) 초과분은 가져오지 않고 안내 토스트 + 업그레이드 유도.
- 완료 후 `notify()` 로 목록 새로고침.

#### 백업 파일은 "사용자가 직접 옮긴다"
- 앱은 zip을 **다운로드**(Android: 다운로드 폴더 / iOS: 사파리 → 파일 앱) 만 수행. 클라우드 업로드, 자동 동기화, 공유 시트 자동호출 모두 하지 않음.
- 다른 기기로 옮길 때는 사용자가 USB/이메일/메신저/AirDrop/Google Drive 등 본인 수단으로 zip을 옮긴 뒤, **새 기기에서 같은 계정으로 로그인 → [복원]에서 zip 선택**.

#### Android ↔ iOS 호환성 고려
- 컨테이너: 일반 ZIP(deflate). JSZip이 만드는 ZIP은 두 OS의 기본 압축 도구에서 모두 풀림.
- 텍스트: `manifest.json`, `album.json` 모두 **UTF-8** + LF 줄바꿈으로 통일.
- 파일명: 사용자 입력 텍스트는 폴더명에 쓰지 않음. 폴더는 `albums/<uuid>/`, 사진은 `001.jpg` 같은 ASCII만 사용 → 두 OS의 파일시스템 차이(NFC/NFD 정규화, 대소문자) 영향 없음.
- 이미지 포맷: 원본이 jpg/png면 그대로, HEIC 등은 dataURL이 이미 jpeg로 디코드돼 있으므로 jpg로 저장(iOS HEIC를 안드로이드에서 못 여는 문제 회피).
- 경로 구분자: zip 내부 경로는 항상 `/`. 메모리상 경로 조립도 슬래시만 사용.
- 시간/타임스탬프: ISO-8601(UTC) 문자열로 저장.
- 식별자: `manifest.owner.userId`는 Supabase `auth.uid()`(동일 계정이면 OS 달라도 동일) 기준이라 OS 간 매칭 문제 없음.
- 다운로드 트리거: 웹 표준 `<a download>` + `Blob`. 네이티브 셸이 있으면 셸이 시스템 다운로드로 처리, 없으면 브라우저가 처리. iOS Safari는 "다운로드"가 파일 앱으로 들어가므로 안내 문구에 짧게 명시.

## 3) 추가 의존성

- `bun add jszip`

## 4) i18n 추가 키 (en/ko)

`settingsTitle`, `accountSection`, `guestStatus`, `subscribedMonthly`, `subscribedYearly`, `subscribedNextDate(date)`, `extraCredits(n)`, `freePlan`, `purchasesSection`, `noPurchases`, `restorePurchases`, `upgradePlan`, `backupSection`, `backupDownload`, `backupRestore`, `backupHintManualMove`, `backupOwnerMismatch`, `backupGuestOnlyMismatch`, `backupInvalid`, `backupDone(n)`, `backupSkippedFreeLimit(n)`.

## 5) 변경 파일

- `src/routes/index.tsx` — 설정 아이콘 버튼 추가
- `src/routes/settings.tsx` — Account / Purchases / Backup 섹션 추가
- `src/lib/backup.ts` (신규) — `exportBackupZip()`, `importBackupZip(file, currentUserId|null)` + 소유자 매칭 검증
- `src/lib/i18n.ts` — 신규 키
- `package.json` — `jszip`

## 범위 외(이번 작업에서 안 함)

- 클라우드/서버 자동 백업
- 백업 파일 자동 동기화·자동 검색
- 백업 zip 암호화(필요해지면 다음 단계에서 비밀번호 보호 zip로 확장)
