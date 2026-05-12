## 원인 분석

앨범은 `src/lib/storage.ts`에서 `idb-keyval`(IndexedDB, 키 `memori_albums_v1`)에 저장됩니다. 데이터를 사라지게 하는 원인은 코드 버그가 아니라 **브라우저 저장소 휘발성** 쪽입니다. 실제로 가능한 시나리오:

1. **서로 다른 오리진(origin)에서 접속**
   - 어제: Lovable preview(`id-preview--…lovable.app`)
   - 오늘: published(`ince.lovable.app`) 또는 그 반대
   - IndexedDB는 오리진별로 분리되므로 다른 도메인에서 보면 어제 앨범이 안 보입니다. **가장 흔한 원인**입니다.

2. **모바일 브라우저의 저장소 자동 삭제**
   - iOS Safari: 7일 미사용 시 IndexedDB 삭제 (ITP)
   - Android Chrome / 인앱 브라우저: 저장 공간 부족 시 "best-effort" 데이터 자동 축출
   - 시크릿 탭/인앱 브라우저는 세션 종료 시 삭제
   - 우리는 `navigator.storage.persist()`를 호출하지 않아 "best-effort" 등급이라 축출 대상

3. **PWA 홈 추가 vs 일반 탭의 컨텍스트 차이**
   - 일부 안드로이드 브라우저(특히 삼성 인터넷)는 홈 추가 PWA와 일반 탭의 저장소를 사실상 분리 취급

코드 자체는 정상이지만, 위 환경 요인 때문에 "어제 만든 게 오늘 안 보인다"가 실제로 발생합니다. Capacitor로 진짜 안드로이드 앱이 되면 이 문제는 사라지지만, 그 전까지는 **명시적 영속성 요청 + 자가진단 도구**로 보강해야 합니다.

## 적용할 보강

### 1. `navigator.storage.persist()` 요청 (`src/lib/storage.ts`)
앱 부팅 시 단 한 번 호출하여 IndexedDB를 "persistent"로 승격. 브라우저가 사용자 동의나 휴리스틱(설치형/즐겨찾기 등) 통과 시 자동 승인하며, 승인된 이후 브라우저는 저장소를 임의 삭제하지 않음.

### 2. 저장소 상태 진단 패널 (설정 화면 하단)
`src/routes/settings.tsx`에 "저장소 상태" 섹션 추가:
- 현재 오리진(`location.origin`) 표시 — 도메인이 바뀌었는지 사용자가 직접 확인 가능
- `navigator.storage.estimate()`의 `usage` / `quota` 표시
- `navigator.storage.persisted()` 결과(영속/임시) 표시
- "지금 영속화 요청" 버튼 — 다시 한 번 시도

### 3. 도메인 분리 안내
첫 진입 시 prod와 preview 두 URL이 다르면 데이터가 분리됨을 알리는 1회용 안내. 이미 있는 `StorageNoticeDialog`에 한 줄 추가.

### 4. (선택) ZIP 자동 백업 리마인더
`src/lib/backup.ts`에 이미 ZIP 백업이 있으므로, 앨범이 5개 이상 쌓이면 "ZIP으로 백업해 두세요" 토스트를 1회 보여주는 정도만 추가.

### 변경 파일
- `src/lib/storage.ts` — `requestPersistentStorage()` 추가, 모듈 로드 시 호출
- `src/routes/__root.tsx` — 부팅 시 한 번 영속성 요청
- `src/routes/settings.tsx` — 저장소 진단 패널
- `src/components/StorageNoticeDialog.tsx` — 도메인 분리 한 줄 추가
- `src/lib/i18n.ts` — 새 문구

### 손대지 않는 것
- 앨범 저장 키/스키마 (`memori_albums_v1`) — 기존 데이터 호환 유지
- Firebase / Supabase fallback 경로
- `dailyLimit.ts` 로직 (별도 키 `moara_last_album_date`)

## 사용자가 지금 직접 확인해 볼 것

이 계획을 적용하기 전에라도, 어제 휴대폰에서 접속했던 **정확한 URL**과 오늘 접속한 URL이 같은지 먼저 확인해 주세요(주소창의 도메인 부분). 다르다면 어제 도메인으로 다시 들어가면 앨범이 그대로 있을 가능성이 높습니다.
