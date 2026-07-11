## 백업 권장 토스트 (10개 증가마다 1회)

### 동작
- 마지막 안내 시점 대비 앨범 수가 **10개 이상 늘어날 때마다** 홈 화면에서 sonner 토스트로 1회 안내.
- 백업 실행 여부와 무관.
- 안내 직후 baseline을 현재 앨범 수로 갱신 → 다음 트리거는 다시 +10부터 (사용자 피로도 방지).

### 스토리지 키
- `moara_backup_reminder_baseline_v1`: 마지막으로 안내한 시점(또는 최초 실행 시)의 앨범 수.
  - 없으면 첫 로드 시 현재 앨범 수로 초기화 (즉시 트리거 방지).

### 변경 파일

**1) `src/lib/backupReminder.ts` (신규, 클라이언트 전용 헬퍼)**
```ts
const KEY = "moara_backup_reminder_baseline_v1";
export function checkBackupReminder(currentCount: number): boolean {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw == null) {
      localStorage.setItem(KEY, String(currentCount));
      return false;
    }
    const baseline = Number(raw) || 0;
    if (currentCount - baseline >= 10) {
      localStorage.setItem(KEY, String(currentCount));
      return true;
    }
    return false;
  } catch { return false; }
}
```

**2) `src/routes/index.tsx`**
- 기존 `reload()` useEffect의 `getAlbums().then((list) => { setAlbums(list); ... })` 내부에서 로드 후
  `if (checkBackupReminder(list.length)) toast(t.backupReminder);` 호출.
- `toast`는 `sonner`에서 import.

**3) `src/lib/i18n.ts`**
- 신규 키 `backupReminder` 추가:
  - KO: "앨범이 늘어나고 있어요. 안전하게 보관하려면 설정에서 백업을 만들어두세요."
  - EN: "Your library keeps growing. Create a backup in Settings to keep it safe."

### 미변경
- `src/lib/backup.ts`, `src/routes/settings.tsx`는 손대지 않음 (백업 실행과 무관하게 동작).

### 서버/데이터 영향
- 없음. localStorage만 사용.
