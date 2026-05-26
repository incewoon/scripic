// Single source of truth for Firebase Auth on the web.
//
// - One Auth instance (singleton via getAuth)
// - Persistence is explicitly set (browserLocal → indexedDB → session) so
//   anonymous UIDs survive refresh / re-entry. This is what makes the
//   "1 album per day" quota stable for the same browser.
// - ensureFirebaseUser() is the ONLY place that calls signInAnonymously.
//   It is idempotent: concurrent callers share the same in-flight promise,
//   so React Strict Mode / multiple components never trigger duplicate
//   anonymous sign-ins.

import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  setPersistence,
  browserLocalPersistence,
  indexedDBLocalPersistence,
  browserSessionPersistence,
  type Auth,
  type User,
} from "firebase/auth";
import { getFirebase } from "./client";

let _auth: Auth | null = null;
let _persistenceReady: Promise<void> | null = null;
let _initialStateReady: Promise<User | null> | null = null;
let _ensurePromise: Promise<User> | null = null;

export function getAppAuth(): Auth {
  if (_auth) return _auth;
  _auth = getAuth(getFirebase());
  return _auth;
}

function ensurePersistence(auth: Auth): Promise<void> {
  if (_persistenceReady) return _persistenceReady;
  _persistenceReady = (async () => {
    // Try local → indexedDB → session. Some browsers (Safari private,
    // some WebViews) reject the first option; the fallback is fine for the
    // same tab session.
    const candidates = [
      browserLocalPersistence,
      indexedDBLocalPersistence,
      browserSessionPersistence,
    ];
    for (const p of candidates) {
      try {
        await setPersistence(auth, p);
        return;
      } catch (e) {
        // try next
        console.warn("[firebase-auth] setPersistence failed, trying next:", e);
      }
    }
  })();
  return _persistenceReady;
}

/**
 * Wait until Firebase has restored (or confirmed the absence of) the
 * persisted session. Resolves with the current user or null. Does NOT
 * trigger sign-in.
 */
export function waitForInitialAuthState(): Promise<User | null> {
  if (_initialStateReady) return _initialStateReady;
  const auth = getAppAuth();
  _initialStateReady = ensurePersistence(auth).then(
    () =>
      new Promise<User | null>((resolve) => {
        const unsub = onAuthStateChanged(
          auth,
          (u) => {
            unsub();
            resolve(u);
          },
          (err) => {
            console.error("[firebase-auth] initial onAuthStateChanged error:", err);
            unsub();
            resolve(null);
          },
        );
      }),
  );
  return _initialStateReady;
}

/**
 * Guarantee an authenticated Firebase user (anonymous by default).
 *
 * - Idempotent: multiple concurrent callers share one promise.
 * - Reuses the persisted anonymous UID across reloads so the daily
 *   album quota stays stable on the same device/browser.
 */
export function ensureFirebaseUser(): Promise<User> {
  if (_ensurePromise) return _ensurePromise;
  _ensurePromise = (async () => {
    const auth = getAppAuth();
    const existing = await waitForInitialAuthState();
    if (existing) {
      console.log("[firebase-auth] existing user reused:", existing.uid);
      return existing;
    }
    console.log("[firebase-auth] no user → signInAnonymously()");
    try {
      const cred = await signInAnonymously(auth);
      console.log("[firebase-auth] anonymous sign-in ok:", cred.user.uid);
      return cred.user;
    } catch (err: any) {
      console.error(
        "[firebase-auth] anonymous sign-in failed:",
        err?.code,
        err?.message,
      );
      // Allow a retry on the next call
      _ensurePromise = null;
      throw err;
    }
  })();
  return _ensurePromise;
}
