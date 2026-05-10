// Firebase web client. Initializes app, App Check, and Functions SDK.
//
// The web config below is your Firebase project's PUBLIC config — it is safe
// to ship in the bundle. App Check + Cloud Functions enforcement is what
// keeps the Gemini key on the server.
//
// Override any field via VITE_FIREBASE_* env vars (useful for staging).

import { initializeApp, getApps, getApp, type FirebaseOptions } from "firebase/app";
import {
  initializeAppCheck,
  ReCaptchaV3Provider,
  CustomProvider,
  type AppCheck,
} from "firebase/app-check";
import { getFunctions, type Functions } from "firebase/functions";

const env = (import.meta as any).env ?? {};

const firebaseConfig: FirebaseOptions = {
  apiKey: env.VITE_FIREBASE_API_KEY ?? "REPLACE_ME",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? "ai-album-app.firebaseapp.com",
  projectId: env.VITE_FIREBASE_PROJECT_ID ?? "ai-album-app",
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET ?? "ai-album-app.appspot.com",
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "REPLACE_ME",
  appId: env.VITE_FIREBASE_APP_ID ?? "REPLACE_ME",
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
      _appCheck = initializeAppCheck(_app, {
        provider: new CustomProvider({
          getToken: async () => {
            const t = await nativeBridge.getToken();
            return { token: t.token, expireTimeMillis: t.expireTimeMillis };
          },
        }),
        isTokenAutoRefreshEnabled: true,
      });
    } else if (recaptchaKey) {
      _appCheck = initializeAppCheck(_app, {
        provider: new ReCaptchaV3Provider(recaptchaKey),
        isTokenAutoRefreshEnabled: true,
      });
    }
    // else: no provider — works only in dev with FIREBASE_APPCHECK_DEBUG_TOKEN.
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

export function isFirebaseReady(): boolean {
  return isConfigured();
}
