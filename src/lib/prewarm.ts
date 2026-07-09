// src/lib/prewarm.ts
// Observability helper for the "AI 사전 워밍" (Firebase auth + App Check + Functions client)
// that runs on the photo-upload screen before the user enters the chat.
//
// Records milestone timestamps into window.__AI_PREWARM__ so that later
// screens (aiClient, chat.tsx) can log a definitive "were we ready when
// the first AI call fired?" snapshot in the browser console.

import { ensureFirebaseUser } from "@/integrations/firebase/auth";
import { getAppCheckInstance, getFns } from "@/integrations/firebase/client";
import { getToken } from "firebase/app-check";

export type PrewarmSnapshot = {
  startedAt: number | null;
  authReadyAt: number | null;
  appCheckReadyAt: number | null;
  fnsReadyAt: number | null;
  readyAt: number | null; // all three done
  authOk: boolean | null;
  appCheckOk: boolean | null;
  authError?: string;
  appCheckError?: string;
  uid?: string;
  appCheckTokenLen?: number;
  appCheckExpiresInMs?: number;
};

declare global {
  interface Window {
    __AI_PREWARM__?: PrewarmSnapshot;
    __AI_PREWARM_PROMISE__?: Promise<void>;
  }
}

function state(): PrewarmSnapshot {
  if (typeof window === "undefined") {
    return {
      startedAt: null,
      authReadyAt: null,
      appCheckReadyAt: null,
      fnsReadyAt: null,
      readyAt: null,
      authOk: null,
      appCheckOk: null,
    };
  }
  if (!window.__AI_PREWARM__) {
    window.__AI_PREWARM__ = {
      startedAt: null,
      authReadyAt: null,
      appCheckReadyAt: null,
      fnsReadyAt: null,
      readyAt: null,
      authOk: null,
      appCheckOk: null,
    };
  }
  return window.__AI_PREWARM__;
}

function maybeMarkReady(s: PrewarmSnapshot) {
  if (s.authReadyAt && s.appCheckReadyAt && s.fnsReadyAt && !s.readyAt) {
    s.readyAt = performance.now();
    console.log("[Prewarm] ✅ all ready", {
      totalMs: Math.round(s.readyAt - (s.startedAt ?? s.readyAt)),
      authMs: s.authReadyAt && s.startedAt ? Math.round(s.authReadyAt - s.startedAt) : null,
      appCheckMs:
        s.appCheckReadyAt && s.startedAt ? Math.round(s.appCheckReadyAt - s.startedAt) : null,
      fnsMs: s.fnsReadyAt && s.startedAt ? Math.round(s.fnsReadyAt - s.startedAt) : null,
    });
  }
}

/**
 * Kick off (or reuse) the AI-connection prewarm. Safe to call many times.
 * Fire-and-forget; caller does not need to await. All results are recorded
 * into window.__AI_PREWARM__ for later diagnostic logging.
 */
export function prewarmAI(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.__AI_PREWARM_PROMISE__) return window.__AI_PREWARM_PROMISE__;

  const s = state();
  s.startedAt = performance.now();
  console.log("[Prewarm] ▶ start", { ts: new Date().toISOString() });

  const p = (async () => {
    // 1) Firebase Functions client init (cheap, but touches getFirebase()).
    try {
      getFns();
      s.fnsReadyAt = performance.now();
      console.log("[Prewarm] getFns() ok", {
        elapsedMs: Math.round(s.fnsReadyAt - (s.startedAt ?? s.fnsReadyAt)),
      });
    } catch (e: any) {
      console.error("[Prewarm] getFns() failed", { code: e?.code, message: e?.message });
    }

    // 2) Anonymous auth + persistence.
    const authT0 = performance.now();
    try {
      const u = await ensureFirebaseUser();
      s.authReadyAt = performance.now();
      s.authOk = true;
      s.uid = u.uid;
      console.log("[Prewarm] ensureFirebaseUser ok", {
        uid: u.uid,
        elapsedMs: Math.round(s.authReadyAt - authT0),
      });
    } catch (e: any) {
      s.authReadyAt = performance.now();
      s.authOk = false;
      s.authError = e?.code ?? e?.message ?? "unknown";
      console.error("[Prewarm] ensureFirebaseUser failed", {
        code: e?.code,
        message: e?.message,
        elapsedMs: Math.round(s.authReadyAt - authT0),
      });
    }

    // 3) App Check token — force acquisition so the first callable doesn't
    //    pay for it. `false` = don't force refresh, but this still triggers
    //    initial issuance if none is cached.
    const acT0 = performance.now();
    try {
      const app = getFirebase();
      const appCheck = getAppCheck(app);
      const tok = await getToken(appCheck, false);
      s.appCheckReadyAt = performance.now();
      s.appCheckOk = true;
      s.appCheckTokenLen = tok?.token?.length;
      s.appCheckExpiresInMs = (tok as any)?.expireTimeMillis
        ? (tok as any).expireTimeMillis - Date.now()
        : undefined;
      console.log("[Prewarm] appCheck getToken ok", {
        elapsedMs: Math.round(s.appCheckReadyAt - acT0),
        tokenLen: s.appCheckTokenLen,
        expiresInMs: s.appCheckExpiresInMs,
      });
    } catch (e: any) {
      s.appCheckReadyAt = performance.now();
      s.appCheckOk = false;
      s.appCheckError = e?.code ?? e?.message ?? "unknown";
      console.error("[Prewarm] appCheck getToken failed", {
        code: e?.code,
        message: e?.message,
        elapsedMs: Math.round(s.appCheckReadyAt - acT0),
      });
    }

    maybeMarkReady(s);
  })();

  window.__AI_PREWARM_PROMISE__ = p;
  return p;
}

/**
 * Non-blocking snapshot for correlation logging at AI call sites.
 * `wasReady` = 첫 AI 호출 시점에 사전 워밍이 완료돼 있었는가.
 */
export function prewarmSnapshot() {
  const s = state();
  const now = performance.now();
  return {
    startedAt: s.startedAt,
    readyAt: s.readyAt,
    wasReady: !!s.readyAt,
    authOk: s.authOk,
    appCheckOk: s.appCheckOk,
    uid: s.uid,
    msSincePrewarmStart: s.startedAt != null ? Math.round(now - s.startedAt) : null,
    msSinceReady: s.readyAt != null ? Math.round(now - s.readyAt) : null,
    authError: s.authError,
    appCheckError: s.appCheckError,
  };
}
