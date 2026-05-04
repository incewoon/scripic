# 계정별 앨범 분리 (옵션 A)

## 동작 결과

| 상황 | 보이는 앨범 |
|---|---|
| A 로그인 | A의 앨범만 |
| B로 전환 | B의 앨범만 (A 것은 안 보임, 데이터는 보존) |
| 다시 A로 | A 앨범 그대로 부활 |
| 로그아웃 | 게스트 슬롯 (보통 비어있음) |
| 첫 로그인 + 이미 게스트 앨범 있음 | 그 계정으로 1회 자동 이관, 게스트 슬롯 비움 |

같은 기기 안에서 계정을 몇 번 오가도 각 계정의 앨범은 IndexedDB에 그대로 살아 있어요. 다른 기기에선 여전히 보이지 않아요(이건 옵션 A의 한계, 클라우드 동기화는 안 함).

## 변경 파일

### 1. `src/lib/storage.ts` — 저장 키를 계정별로 분기

저장 키 규칙:
- 게스트(로그아웃): `memori_albums_v1`
- 로그인 계정: `memori_albums_v1__<user_id>`

새 API:
- `setStorageUserId(uid: string | null)` — auth가 바뀔 때마다 호출. 활성 키를 갱신하고 구독자에게 알림.
- `subscribeAlbums(fn)` — 저장소 스코프나 내용이 바뀔 때 화면이 다시 읽도록 구독.

자동 이관 로직 (`setStorageUserId` 안):
- uid가 null→실제값으로 바뀐 첫 호출일 때, 그 계정 키가 비었고 게스트 키에 데이터가 있으면:
  - 게스트 리스트를 계정 키로 복사
  - 게스트 키 삭제
- 같은 uid에 대해서는 두 번 이관하지 않도록 메모리 Set으로 가드.

기존 `getAlbums / saveAlbum / updateAlbum / deleteAlbum`은 시그니처 그대로, 내부적으로 `activeKey()`를 사용. mutation 후엔 `notify()` 호출.

### 2. `src/lib/auth.tsx` — 세션 변화 시 storage 바인딩

`onAuthStateChange`와 초기 `getSession` 콜백 안에서 `setStorageUserId(s?.user?.id ?? null)` 호출. 로그아웃 시 `null`을 넘겨 게스트 슬롯으로 복귀.

### 3. `src/routes/index.tsx` (홈) — 구독으로 자동 reload

```text
useEffect(() => {
  const reload = () => getAlbums().then(setAlbums);
  reload();
  return subscribeAlbums(reload);
}, []);
```

`useEffect([])`로 한 번만 읽던 부분을 구독 패턴으로 교체. 계정 전환 즉시 리스트가 갱신됨. 크레딧 뱃지의 `Math.min(count, 5)`도 새 리스트 기준으로 자연스럽게 다시 계산됨.

### 4. `src/routes/album.$id.tsx` — 같은 패턴

상세 화면에서도 `subscribeAlbums`로 재조회. 다른 계정으로 전환하면 그 앨범이 더 이상 존재하지 않으므로 자동으로 "앨범을 찾을 수 없어요" 상태로 떨어지게 됨.

### 5. `src/routes/chat.tsx` — 변경 없음

`saveAlbum` 호출이 알아서 활성 계정 키에 저장됨. (대화 진입 자체가 로그인 사용자만 가능하도록 홈에서 이미 게이트 중)

## 주의 / 한계

- 기기를 바꾸면 같은 계정으로 로그인해도 앨범은 따라오지 않음(여전히 IndexedDB에만 있음). 멀티 디바이스 동기화가 필요해지면 옵션 B/C로 확장.
- 자동 이관은 "그 계정 슬롯이 비어있을 때만" 실행. 이미 그 계정의 앨범이 있다면 게스트 데이터는 건드리지 않고 그대로 둠(데이터 손실 방지).
- 한 번 이관된 게스트 데이터는 게스트 슬롯에서 사라지므로, 같은 기기에서 다른 계정에 또 이관되지 않음.
- 브라우저 데이터 삭제 / 시크릿 모드는 IndexedDB 자체가 사라지므로 기존과 동일하게 데이터가 비어 보임.
