## 목표
앱이 완전히 종료된 상태에서도 카메라 롤에 사진이 3장 이상 새로 쌓이면 시스템 알림을 띄우도록, 100% 네이티브 Android(WorkManager) 백그라운드 작업을 구현한다. `src/lib/reminders.ts`, `src/lib/native.ts`는 건드리지 않는다.

---

## 1) 의존성 & 매니페스트

**`android/app/build.gradle`** — `dependencies`에 추가:
```
implementation("androidx.work:work-runtime:2.9.0")
```

**`android/app/src/main/AndroidManifest.xml`** — 없는 것만 추가:
- `POST_NOTIFICATIONS`
- `READ_MEDIA_IMAGES`
- `READ_EXTERNAL_STORAGE` (`android:maxSdkVersion="32"`)

---

## 2) 상태바용 알림 아이콘 (신규 리소스)

`setSmallIcon`에 컬러 런처 아이콘을 쓰면 상태바에 흰 사각형/뭉개짐으로 표시되므로, 단색(흰색+투명배경) 벡터를 별도로 만든다.

- **`android/app/src/main/res/drawable/ic_stat_notification.xml`** (신규): 흰색 벡터 (예: 카메라/별 심볼, `android:fillColor="#FFFFFFFF"`, 24dp).
- `PhotoReminderWorker`에서 `setSmallIcon(R.drawable.ic_stat_notification)` 사용.

---

## 3) `PhotoReminderWorker.java` (핵심 로직)

경로: `android/app/src/main/java/app/lovable/aialbum/PhotoReminderWorker.java`
`androidx.work.Worker` 상속. `doWork()` 흐름 (순서 중요):

1. `SharedPreferences("scripic_reminder_prefs", MODE_PRIVATE)` 로드.
2. **[필수] 리마인더 활성화 체크**: `reminders_enabled`가 false거나 미존재면 → `lastCheckedAt=now` 저장 후 `Result.success()`. (사용자가 설정에서 OFF했으면 즉시 종료)
3. `lastCheckedAt`(default 0), `lastReminderSentAt`(default 0) 로드.
4. **[필수] 최초 실행 가드**: `lastCheckedAt == 0`이면 미디어 쿼리 없이 `lastCheckedAt=now`만 저장 후 종료. (설치 직후 기존 카메라 롤 전체를 "새 사진"으로 오인하는 것을 방지)
5. **Throttle**: `now - lastReminderSentAt < 7*24h`면 `lastCheckedAt=now` 저장 후 종료.
6. **권한 체크**: SDK 33+는 `READ_MEDIA_IMAGES`, 이하는 `READ_EXTERNAL_STORAGE`. 없으면 `lastCheckedAt=now` 저장 후 종료.
7. **미디어 카운트**: `contentResolver.query(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, {_ID}, "date_added > ?", [String.valueOf(lastCheckedAt/1000)], null)` → `cursor.getCount()`.
8. **3장 이상**이면:
   - `NotificationChannel("photo_reminder_channel", "사진 리마인더", IMPORTANCE_DEFAULT)` 없으면 생성.
   - `Intent(context, MainActivity.class)` + `FLAG_ACTIVITY_SINGLE_TOP|CLEAR_TOP`, `putExtra("deepLink", "/create")`.
   - `PendingIntent.getActivity(..., FLAG_UPDATE_CURRENT|FLAG_IMMUTABLE)`.
   - `NotificationCompat.Builder`: title "새로운 사진이 쌓였어요 ✨", text "새로운 이야기를 기록해볼까요?", `setSmallIcon(R.drawable.ic_stat_notification)`, `setAutoCancel(true)`, `setContentIntent(pi)`.
   - `NotificationManagerCompat.from(ctx).notify(1001, notif)` (SDK 33+ 권한 재확인 후).
   - `lastReminderSentAt = now`.
9. 모든 경로에서 마지막에 `lastCheckedAt = now` 저장.
10. 전 로직 `try/catch` → 예외 시 `Log.e` 후 `Result.success()` (재시도 폭주 방지).
11. 단계마다 `Log.d("PhotoReminderWorker", ...)`: 활성화 여부, 최초 실행 여부, throttle 여부, 권한 여부, 새 사진 수, 알림 발송 여부.

---

## 4) 주기적 작업 등록

**`MainActivity.java`** — `onCreate`의 `registerPlugin(...)` 근처에 추가:
```java
PeriodicWorkRequest req =
    new PeriodicWorkRequest.Builder(PhotoReminderWorker.class, 1, TimeUnit.HOURS).build();
WorkManager.getInstance(this).enqueueUniquePeriodicWork(
    "photo_reminder_check", ExistingPeriodicWorkPolicy.KEEP, req);
```

---

## 5) 딥링크 (polling 방식)

**이벤트 dispatch 방식은 사용하지 않는다** — 웹뷰 로딩 타이밍상 리스너 등록 전에 발사되면 콜드 스타트 시 유실됨. 대신 static 필드 + JS polling.

**`MainActivity.java`**:
- `public static volatile String pendingDeepLink = null;` static 필드.
- `onCreate` super 이후, `onNewIntent(Intent i)` 오버라이드 (`super.onNewIntent(i); setIntent(i);`) 양쪽에서:
  - `String path = intent.getStringExtra("deepLink");` → 있으면 `pendingDeepLink = path;`

**`NotificationPermissionPlugin.java`**에 추가 메서드:
- `@PluginMethod public void getPendingDeepLink(PluginCall call)`:
  - `String p = MainActivity.pendingDeepLink; MainActivity.pendingDeepLink = null;`
  - `JSObject r = new JSObject(); r.put("path", p); call.resolve(r);` (한 번 조회 후 초기화)

**`src/plugins/notification-permission.ts`**: `getPendingDeepLink(): Promise<{path: string | null}>` 래퍼 추가.

**`src/lib/deepLink.ts` (신규)**:
- `export async function consumePendingDeepLink(router)`:
  - `const { path } = await NotificationPermission.getPendingDeepLink();`
  - `if (path) router.navigate({ to: path });`
- (window CustomEvent 방식 없음)

**`src/router.tsx`**: 라우터 생성 직후 `(window as any).__scripicRouter = router;` 노출.
**`src/routes/__root.tsx`**: 마운트 시 `useEffect(() => { import("@/lib/deepLink").then(m => m.consumePendingDeepLink((window as any).__scripicRouter)); }, [])`.

---

## 6) 알림 권한 + 토글 네이티브 동기화

**`android/app/src/main/java/app/lovable/aialbum/NotificationPermissionPlugin.java` (신규)** — `@CapacitorPlugin(name = "NotificationPermission")`.

메서드:
- **`request(PluginCall)`**:
  - SDK < 33 → `resolve({granted: true})`.
  - 이미 `PERMISSION_GRANTED` → `resolve({granted: true})`.
  - 그 외 Capacitor `@PermissionCallback` 패턴으로 `POST_NOTIFICATIONS` 런타임 요청 후 결과 resolve.
- **[필수] `setRemindersEnabled(PluginCall)`**:
  - `boolean enabled = call.getBoolean("enabled", false);`
  - `getContext().getSharedPreferences("scripic_reminder_prefs", MODE_PRIVATE).edit().putBoolean("reminders_enabled", enabled).apply();`
  - `resolve()`.
- **`getPendingDeepLink(PluginCall)`** — §5 참고.

**`MainActivity.java`**: `registerPlugin(NotificationPermissionPlugin.class)` 추가.

**`src/plugins/notification-permission.ts` (신규)**:
```ts
import { registerPlugin } from "@capacitor/core";
export interface NotificationPermissionPlugin {
  request(): Promise<{ granted: boolean }>;
  setRemindersEnabled(opts: { enabled: boolean }): Promise<void>;
  getPendingDeepLink(): Promise<{ path: string | null }>;
}
export const NotificationPermission =
  registerPlugin<NotificationPermissionPlugin>("NotificationPermission");
export async function requestPostNotificationsPermission(): Promise<boolean> {
  try { return (await NotificationPermission.request()).granted; } catch { return false; }
}
export async function setNativeRemindersEnabled(enabled: boolean): Promise<void> {
  try { await NotificationPermission.setRemindersEnabled({ enabled }); } catch { /* web no-op */ }
}
```
기존 `native.ts`의 `requestNotificationPermission`과 이름 겹치지 않게 별도 함수.

**`src/routes/settings.tsx`** — "Memory reminders" 토글:
- **ON 핸들러**: `requestPostNotificationsPermission()` → false면 토글 되돌리고 안내 toast, true면 `await setNativeRemindersEnabled(true)`. 기존 `reminders.ts` 호출 로직 유지.
- **OFF 핸들러**: `await setNativeRemindersEnabled(false)` 호출로 네이티브 프리퍼런스도 동기화.

---

## 7) 기타/주의

- 기존 Capacitor 플러그인들과 `build.gradle` 병합 시 충돌 없음(WorkManager는 신규).
- 신규 Java 클래스는 모두 `app.lovable.aialbum` 패키지.
- 카운트 대상은 MediaStore(카메라 롤) 기준 — 앱 내부 앨범 수와 무관.
- 최소 SDK 24+ 가정, WorkManager 2.9.0.
- `src/lib/reminders.ts`, `src/lib/native.ts`, `src/integrations/supabase/*` 자동생성 파일은 **미변경**.

---

## 변경/신규 파일 요약
- **수정**: `android/app/build.gradle`, `android/app/src/main/AndroidManifest.xml`, `android/app/src/main/java/app/lovable/aialbum/MainActivity.java`, `src/router.tsx`, `src/routes/__root.tsx`, `src/routes/settings.tsx`
- **신규 (Android)**: `PhotoReminderWorker.java`, `NotificationPermissionPlugin.java`, `res/drawable/ic_stat_notification.xml`
- **신규 (JS)**: `src/plugins/notification-permission.ts`, `src/lib/deepLink.ts`
