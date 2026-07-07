# 작업 계획 (v2)

## 현재 App Check 초기화 위치

`android/app/src/main/java/app/lovable/aialbum/MainActivity.java` 의 `onCreate` 내부에 이미 다음 코드 존재:
```java
FirebaseApp.initializeApp(this);
FirebaseAppCheck.getInstance().installAppCheckProviderFactory(
    PlayIntegrityAppCheckProviderFactory.getInstance());
```
→ **여기가 유일한 설치 지점으로 유지**. `MainApplication.java` 를 새로 만들지 않음(중복 초기화 방지, AndroidManifest `android:name` 수정 불필요).

## [1] Android 네이티브 App Check 브릿지

- `android/app/build.gradle`: `firebase-appcheck-playintegrity` 이미 있음 → 스킵.

- `android/app/src/main/java/app/lovable/aialbum/AppCheckPlugin.java` (신규)
  - `load()` 내부에서 **installAppCheckProviderFactory 호출하지 않음**.
  - `@PluginMethod getToken(PluginCall call)` 만 노출:
    ```java
    @CapacitorPlugin(name = "AppCheckBridge")
    public class AppCheckPlugin extends Plugin {
      @PluginMethod
      public void getToken(PluginCall call) {
        FirebaseAppCheck.getInstance().getAppCheckToken(false)
          .addOnSuccessListener(res -> {
            JSObject ret = new JSObject();
            ret.put("token", res.getToken());
            ret.put("expireTimeMillis", res.getExpireTimeMillis());
            call.resolve(ret);
          })
          .addOnFailureListener(e -> call.reject("app_check_failed", e));
      }
    }
    ```

- `MainActivity.java`
  - 기존 `FirebaseApp.initializeApp` + `installAppCheckProviderFactory` 블록 **그대로 유지** (유일 설치 지점).
  - `super.onCreate()` **이전** 라인에 `registerPlugin(AppCheckPlugin.class);` 추가.

## [2] 웹 클라이언트 브릿지 연결

`src/integrations/firebase/client.ts` 상단(import 직후, `getFirebase()` 정의 이전):
```ts
import { Capacitor, registerPlugin } from "@capacitor/core";
interface AppCheckBridgePlugin {
  getToken(): Promise<{ token: string; expireTimeMillis: number }>;
}
if (Capacitor.isNativePlatform()) {
  const AppCheckBridge = registerPlugin<AppCheckBridgePlugin>("AppCheckBridge");
  (window as any).__APPCHECK_NATIVE__ = { getToken: () => AppCheckBridge.getToken() };
}
```
기존 `nativeBridge?.getToken` 분기 및 ReCaptchaV3Provider 폴백은 변경하지 않음.

## [3] Gemini finishReason 검증

`functions/src/gemini.ts`의 `geminiStreamText()`:
- SSE 파싱 루프에서 `obj?.candidates?.[0]?.finishReason` 을 `lastFinishReason` 로 계속 갱신.
- 루프 종료 후:
  ```ts
  if (lastFinishReason && lastFinishReason !== "STOP" && lastFinishReason !== "MAX_TOKENS") {
    throw new GeminiUnavailableError(200, `Gemini finished abnormally: ${lastFinishReason}`);
  }
  ```
`delays`, `classifyStatus`, 시그니처, 재시도 로직 유지.

## [4] 짧은 응답 방어 (chat 콜러블)

`functions/src/index.ts` chat 콜러블, `try { for await ... } catch { ... }` 블록 직후, 기존 `const streamed = full;` 이전에 삽입:
```ts
const trimmedFull = full.trim();
if (!/\[(READY_TO_FINISH|PROPOSE_FINISH)\]/.test(full) && trimmedFull.length < 6) {
  throw new HttpsError("unavailable", "ai_unavailable", { kind: "ai_unavailable", reason: "too_short" });
}
```
기존 정규식 판단/tail 주입/replace 청크 로직 유지.

## [5] 버전 호환성 확인

- Firebase BoM `34.13.0`이 `firebase-appcheck-playintegrity` 버전을 관리 → 명시 버전 지정 없이 BoM에 위임. 다른 firebase 관련 의존성과 충돌 없음.
- AGP `8.13.0`, google-services `4.4.4` 조합 정상.
- 결과: **충돌 없음**.

## 변경 파일

1. `android/app/src/main/java/app/lovable/aialbum/AppCheckPlugin.java` (신규 — getToken 만)
2. `android/app/src/main/java/app/lovable/aialbum/MainActivity.java` (registerPlugin 라인만 추가; App Check 설치 블록 유지)
3. `src/integrations/firebase/client.ts` (상단 브릿지 초기화 추가)
4. `functions/src/gemini.ts` (finishReason 검증)
5. `functions/src/index.ts` (짧은 응답 방어)

구현 완료 후 각 파일의 실제 diff를 함께 출력함.
