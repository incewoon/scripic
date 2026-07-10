// src/integrations/firebase/client.ts

// Firebase web client. Initializes app, App Check, and Functions SDK.
//
// The web config below is your Firebase project's PUBLIC config — it is safe
// to ship in the bundle. App Check + Cloud Functions enforcement is what
// keeps the Gemini key on the server.
//
// Override any field via VITE_FIREBASE_* env vars (useful for staging).

import { initializeApp, getApps, getApp, type FirebaseOptions } from "firebase/app";
import { initializeAppCheck, ReCaptchaV3Provider, CustomProvider, type AppCheck } from "firebase/app-check";
import { getFunctions, type Functions } from "firebase/functions";
import { Capacitor, registerPlugin } from "@capacitor/core";

// Wire the native Play Integrity App Check bridge before getFirebase() runs.
// On native platforms the Android AppCheckPlugin exposes getToken(); we
// expose it on window so the CustomProvider branch below can call it.
interface AppCheckBridgePlugin {
  getToken(): Promise<{ token: string; expireTimeMillis: number }>;
}
if (typeof window !== "undefined" && Capacitor.isNativePlatform()) {
  try {
    const AppCheckBridge = registerPlugin<AppCheckBridgePlugin>("AppCheckBridge");
    (window as any).__APPCHECK_NATIVE__ = {
      getToken: () => AppCheckBridge.getToken(),
    };
    console.log("[firebase] AppCheckBridge native plugin registered");
  } catch (e) {
    console.warn("[firebase] AppCheckBridge registerPlugin failed", e);
  }
}

const env = (import.meta as any).env ?? {};

const firebaseConfig: FirebaseOptions = {
  apiKey: env.VITE_FIREBASE_API_KEY ?? "AIzaSyATURXX76Npx0TO9_sKGuPxm1KW8DtE7l8",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? "ai-album-app.firebaseapp.com",
  projectId: env.VITE_FIREBASE_PROJECT_ID ?? "ai-album-app",
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET ?? "ai-album-app.appspot.com",
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "1035810884575",
  appId: env.VITE_FIREBASE_APP_ID ?? "1:1035810884575:web:4eb93efa39f885a68c526a",
};

let _app: ReturnType<typeof initializeApp> | null = null;
let _functions: Functions | null = null;
let _appCheck: AppCheck | null = null;

function isConfigured(): boolean {
  return firebaseConfig.apiKey !== "REPLACE_ME" && firebaseConfig.appId !== "REPLACE_ME";
}

export function getFirebase() {
  if (_app) return _app;
  if (!isConfigured()) {
    throw new Error(
      "Firebase is not configured. Set VITE_FIREBASE_* env vars or edit src/integrations/firebase/client.ts.",
    );
  }
  _app = getApps().length ? getApp() : initializeApp(firebaseConfig);

  // App Check setup. On Android (Capacitor) the *native* App Check Play
  // Integrity provider is wired by the Android app via google-services.json
  // and the firebase-appcheck-playintegrity dependency. For the web bundle
  // running inside the WebView, we install a CustomProvider that returns
  // the token the native side has already obtained (bridged via window).
  // For a regular browser preview we fall back to reCAPTCHA v3 if a site
  // key is present, otherwise to debug mode.
  try {
    const debugToken = env.VITE_APPCHECK_DEBUG_TOKEN;
    if (debugToken) (globalThis as any).FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;

    const recaptchaKey = env.VITE_RECAPTCHA_V3_SITE_KEY;
    const nativeBridge = (window as any).__APPCHECK_NATIVE__;

    if (nativeBridge?.getToken) {
      console.log("[AppCheck] init provider=native");
    
      // 토큰 캐시 (메모리)
      let cachedToken: { token: string; expireTimeMillis: number } | null = null;
      let inflight: Promise<{ token: string; expireTimeMillis: number }> | null = null;
    
      _appCheck = initializeAppCheck(_app, {
        provider: new CustomProvider({
          getToken: async () => {
            const now = Date.now();
    
            // 1. 캐시가 있고 만료 5분 이상 남았으면 캐시 반환 (네이티브 호출 없음)
            if (cachedToken && cachedToken.expireTimeMillis - now > 5 * 60 * 1000) {
              return {
                token: cachedToken.token,
                expireTimeMillis: cachedToken.expireTimeMillis,
              };
            }
    
            // 2. 이미 네이티브 호출 중이면 같은 Promise 재사용 (동시 호출 방지)
            if (inflight) {
              return inflight;
            }
    
            // 3. 실제 네이티브 호출
            const t0 = performance.now();
            console.log("[AppCheck] native.getToken start (cache miss)");
    
            inflight = (async () => {
              try {
                const t = await nativeBridge.getToken();
                const elapsed = Math.round(performance.now() - t0);
    
                // 방어 코드: expireTimeMillis가 이상하면 1시간으로 강제 설정
                let expire = Number(t?.expireTimeMillis);
                if (!Number.isFinite(expire) || expire <= Date.now()) {
                  expire = Date.now() + 60 * 60 * 1000; // 1시간 폴백
                  console.warn("[AppCheck] invalid expireTimeMillis from native, using 1h fallback");
                }
    
                cachedToken = {
                  token: t.token,
                  expireTimeMillis: expire,
                };
    
                console.log("[AppCheck] native.getToken ok", {
                  elapsedMs: elapsed,
                  tokenLen: t?.token?.length,
                  expireInMs: expire - Date.now(),
                });
    
                return cachedToken;
              } catch (e: any) {
                const elapsed = Math.round(performance.now() - t0);
                console.error("[AppCheck] native.getToken failed", {
                  elapsedMs: elapsed,
                  code: e?.code,
                  message: e?.message,
                });
                throw e;
              } finally {
                inflight = null;
              }
            })();
    
            return inflight;
          },
        }),
        isTokenAutoRefreshEnabled: true,
      });
    } else if (recaptchaKey) {
      console.log("[AppCheck] init provider=recaptcha");
      _appCheck = initializeAppCheck(_app, {
        provider: new ReCaptchaV3Provider(recaptchaKey),
        isTokenAutoRefreshEnabled: true,
      });
    } else {
      console.warn(
        "[AppCheck] init provider=none — 콜러블 호출이 App Check 강제와 함께 실패할 수 있음",
      );
    }
  } catch (e) {
    console.warn("App Check init skipped:", e);
  }

  return _app;
}

export function getFns(): Functions {
  if (_functions) return _functions;
  _functions = getFunctions(getFirebase(), "us-central1");
  return _functions;
}

export function getAppCheckInstance(): AppCheck | null {
  // Trigger init if not done yet
  getFirebase();
  return _appCheck;

}

export function isFirebaseReady(): boolean {
  return isConfigured();
}
