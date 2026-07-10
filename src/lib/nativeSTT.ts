// src/lib/nativSTT.ts

// Native Speech-to-Text wrapper (Android, custom plugin).
//
// The web app keeps using window.webkitSpeechRecognition; this module is only
// used when running inside the Android shell where the Web Speech API is
// blocked by the WebView permission bridge.
//
// This wraps the in-house ScripicSTT plugin (android/.../ScripicSTTPlugin.java),
// which enforces main-thread execution + state locking + forced-destroy
// timeouts so recognizer sessions can no longer become zombies.
//
// Public API (unchanged for chat.tsx):
//   - isNativePlatform()
//   - isNativeSTTAvailable()
//   - ensureSTTPermission()
//   - startNativeSTT(lang, handlers, { autoRestart })
//   - stopNativeSTT()

import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { ScripicSTT } from "@/plugins/scripic-stt";

const TAG = "[STT-native]";

const WATCHDOG_MS = 8000;
const SILENCE_TIMEOUT_MS = 5000;
let silenceTimer: ReturnType<typeof setTimeout> | null = null;
const MAX_CONSECUTIVE_EMPTY_RESTARTS = 3;
const RESTART_DELAY_MS = 300;
const BUSY_RETRY_DELAY_MS = 500;

type SessionState = "idle" | "starting" | "listening" | "stopping";

type Handlers = {
  onPartial: (text: string) => void;
  onCommit?: (text: string) => void;
  onEnd: () => void;
  onError?: (err: unknown) => void;
};

type StartOptions = { autoRestart?: boolean };

// --- module-level session state ---
let state: SessionState = "idle";
let currentGen = 0;

let partialHandle: PluginListenerHandle | null = null;
let stateHandle: PluginListenerHandle | null = null;
let errorHandle: PluginListenerHandle | null = null;

let watchdogTimer: ReturnType<typeof setTimeout> | null = null;
let sawPartialThisSession = false;
let lastPartialText = "";
let partialCount = 0;
let consecutiveEmptyRestarts = 0;

let userRequestedStop = false;
let currentLang = "en-US";
let currentAutoRestart = false;
let currentHandlers: Handlers | null = null;
let lastErrorWasFatal = false;

export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

export async function isNativeSTTAvailable(): Promise<boolean> {
  if (!isNativePlatform()) {
    console.log(`${TAG} available? not a native platform`);
    return false;
  }
  try {
    const r = await ScripicSTT.available();
    console.log(`${TAG} available?`, { supported: !!r?.available });
    return !!r.available;
  } catch (e) {
    console.warn(`${TAG} available? threw`, e);
    return false;
  }
}

export async function ensureSTTPermission(): Promise<boolean> {
  try {
    const before = await ScripicSTT.checkPermissions();
    if (before.speechRecognition === "granted") {
      console.log(`${TAG} permission granted (pre-check)`);
      return true;
    }
    const after = await ScripicSTT.requestPermissions();
    const granted = after.speechRecognition === "granted";
    console.log(`${TAG} permission`, {
      before: before.speechRecognition,
      after: after.speechRecognition,
      granted,
    });
    return granted;
  } catch (e) {
    console.warn(`${TAG} permission threw`, e);
    return false;
  }
}

function clearWatchdog() {
  if (watchdogTimer) {
    clearTimeout(watchdogTimer);
    watchdogTimer = null;
  }
}

function clearSilenceTimer() {
  if (silenceTimer) {
    clearTimeout(silenceTimer);
    silenceTimer = null;
  }
}

function armSilenceTimer(gen: number) {
  clearSilenceTimer();
  silenceTimer = setTimeout(() => {
    if (gen !== currentGen) return;
    console.log(`${TAG} [SILENCE] no speech for ${SILENCE_TIMEOUT_MS}ms → userRequestedStop=true, stopping`);
    userRequestedStop = true;
    ScripicSTT.stop().catch(() => handleSessionEnd(gen, "silence"));
  }, SILENCE_TIMEOUT_MS);
}

function armWatchdog(gen: number) {
  clearWatchdog();
  clearSilenceTimer();
  watchdogTimer = setTimeout(() => {
    if (gen !== currentGen) return;
    console.warn(`${TAG} [WATCHDOG] fired`, {
      gen,
      state,
      sawPartialThisSession,
    });
    ScripicSTT.stop().catch(() => {
      handleSessionEnd(gen, "watchdog");
    });
  }, WATCHDOG_MS);
}

async function detachListeners() {
  const targets: Array<[string, PluginListenerHandle | null]> = [
    ["partial", partialHandle],
    ["state", stateHandle],
    ["error", errorHandle],
  ];
  for (const [name, h] of targets) {
    try {
      await h?.remove?.();
    } catch (e) {
      console.warn(`${TAG} detach ${name} threw`, e);
    }
  }
  partialHandle = null;
  stateHandle = null;
  errorHandle = null;
  console.log(`${TAG} listeners detached`);
}

async function handleSessionEnd(
  gen: number,
  reason: "user" | "silence" | "error" | "watchdog",
) {
  if (gen !== currentGen) {
    console.log(`${TAG} [END] ignored (stale gen)`, { gen, currentGen, reason });
    return;
  }

  const wasFatal = lastErrorWasFatal;
  const willRestart =
    currentAutoRestart &&
    !userRequestedStop &&
    !wasFatal &&
    reason !== "error" &&
    consecutiveEmptyRestarts < MAX_CONSECUTIVE_EMPTY_RESTARTS;

  console.log(`${TAG} [END]`, {
    reason,
    willRestart,
    sawPartialThisSession,
    consecutiveEmptyRestarts,
    partialCount,
  });

  clearWatchdog();
  clearSilenceTimer();

  const handlers = currentHandlers;

  if (handlers?.onCommit && lastPartialText) {
    try {
      handlers.onCommit(lastPartialText);
    } catch (e) {
      console.warn(`${TAG} onCommit threw`, e);
    }
  }

  if (!willRestart) {
    state = "idle";
    userRequestedStop = false;
    consecutiveEmptyRestarts = 0;
    lastErrorWasFatal = false;
    void detachListeners();
    try {
      handlers?.onEnd();
    } catch (e) {
      console.warn(`${TAG} onEnd threw`, e);
    }
    currentHandlers = null;
    return;
  }

  if (!sawPartialThisSession) consecutiveEmptyRestarts++;
  else consecutiveEmptyRestarts = 0;

  sawPartialThisSession = false;
  lastPartialText = "";
  partialCount = 0;
  state = "starting";
  console.log(`${TAG} restart attempt`, { consecutiveEmptyRestarts });

  await new Promise((r) => setTimeout(r, RESTART_DELAY_MS));

  const doStart = () =>
    ScripicSTT.start({ language: currentLang, partialResults: true });

  try {
    await doStart();
    if (gen !== currentGen) return;
    console.log(`${TAG} plugin.start OK (restart)`);
    armWatchdog(gen);
    armSilenceTimer(gen);
  } catch (err: any) {
    const msg = String(err?.message ?? err ?? "");
    if (/busy/i.test(msg)) {
      console.warn(`${TAG} restart got busy → retry in ${BUSY_RETRY_DELAY_MS}ms`);
      await new Promise((r) => setTimeout(r, BUSY_RETRY_DELAY_MS));
      if (gen !== currentGen) return;
      try {
        await doStart();
        console.log(`${TAG} plugin.start OK (busy retry)`);
        armWatchdog(gen);
        armSilenceTimer(gen);
        return;
      } catch (err2) {
        console.error(`${TAG} plugin.start FAIL (busy retry)`, err2);
        err = err2;
      }
    } else {
      console.error(`${TAG} plugin.start FAIL (restart)`, err);
    }
    state = "idle";
    userRequestedStop = false;
    consecutiveEmptyRestarts = 0;
    lastErrorWasFatal = false;
    void detachListeners();
    try {
      handlers?.onError?.(err);
    } catch {
      /* noop */
    }
    try {
      handlers?.onEnd();
    } catch {
      /* noop */
    }
    currentHandlers = null;
  }
}

export async function startNativeSTT(
  lang: string,
  h: Handlers,
  opts: StartOptions = {},
): Promise<void> {
  if (state !== "idle") {
    console.log(`${TAG} start requested while state=${state} → tearing down previous`);
    userRequestedStop = true;
    try {
      await ScripicSTT.stop();
    } catch {
      /* noop */
    }
    await detachListeners();
    clearWatchdog();
    clearSilenceTimer();
    state = "idle";
    userRequestedStop = false;
  }

  const gen = ++currentGen;
  currentLang = lang;
  currentAutoRestart = !!opts.autoRestart;
  currentHandlers = h;
  userRequestedStop = false;
  sawPartialThisSession = false;
  lastPartialText = "";
  partialCount = 0;
  consecutiveEmptyRestarts = 0;
  lastErrorWasFatal = false;
  state = "starting";

  console.log(`${TAG} start requested`, { lang, gen, autoRestart: currentAutoRestart });

  try {
    partialHandle = await ScripicSTT.addListener("partialResults", (data) => {
      if (gen !== currentGen) return;
      const m = data?.matches?.[0];
      if (typeof m !== "string" || m.length === 0) return;
      sawPartialThisSession = true;
      lastPartialText = m;
      partialCount++;
      if (partialCount <= 3 || partialCount % 10 === 0) {
        console.log(`${TAG} partial#${partialCount}`, {
          len: m.length,
          text: m.length > 40 ? m.slice(0, 40) + "…" : m,
        });
      }
      armWatchdog(gen);
      armSilenceTimer(gen);
      try {
        h.onPartial(m);
      } catch (e) {
        console.warn(`${TAG} onPartial threw`, e);
      }
    });

    stateHandle = await ScripicSTT.addListener("listeningState", (data) => {
      if (gen !== currentGen) return;
      console.log(`${TAG} listeningState`, data);
      if (data?.status === "started") {
        state = "listening";
      } else if (data?.status === "stopped") {
        handleSessionEnd(
          gen,
          userRequestedStop ? "user" : lastErrorWasFatal ? "error" : "silence",
        );
      }
    });

    errorHandle = await ScripicSTT.addListener("error", (data) => {
      if (gen !== currentGen) return;
      console.warn(`${TAG} error event`, data);
      const code = data?.code;
      const msg = data?.message ?? String(code);
      const fatal =
        msg === "insufficient_permissions" ||
        msg === "client_error" ||
        msg === "audio";
      lastErrorWasFatal = fatal;
      try {
        h.onError?.({ code, message: msg, fatal });
      } catch {
        /* noop */
      }
      if (fatal) userRequestedStop = true;
      // "stopped" listener will drive handleSessionEnd afterwards.
    });

    console.log(`${TAG} listeners attached`, {
      partial: !!partialHandle,
      state: !!stateHandle,
      error: !!errorHandle,
    });
  } catch (err) {
    console.error(`${TAG} attach listeners FAIL`, err);
    await detachListeners();
    state = "idle";
    currentHandlers = null;
    throw err;
  }

  try {
    await ScripicSTT.start({ language: lang, partialResults: true });
    if (gen !== currentGen) return;
    console.log(`${TAG} [START] plugin.start OK`, { gen });
    armWatchdog(gen);
    armSilenceTimer(gen);
  } catch (err: any) {
    const msg = String(err?.message ?? err ?? "");
    if (/busy/i.test(msg)) {
      console.warn(`${TAG} initial start got busy → retry in ${BUSY_RETRY_DELAY_MS}ms`);
      await new Promise((r) => setTimeout(r, BUSY_RETRY_DELAY_MS));
      if (gen !== currentGen) return;
      try {
        await ScripicSTT.start({ language: lang, partialResults: true });
        console.log(`${TAG} [START] plugin.start OK (busy retry)`);
        armWatchdog(gen);
        armSilenceTimer(gen);
        return;
      } catch (err2) {
        err = err2;
      }
    }
    console.error(`${TAG} plugin.start FAIL`, err);
    await detachListeners();
    clearWatchdog(); //
    clearSilenceTimer();
    state = "idle";
    currentHandlers = null;
    try {
      h.onError?.(err);
    } catch {
      /* noop */
    }
    throw err;
  }
}

export async function stopNativeSTT(): Promise<void> {
  console.log(`${TAG} stop requested`, { state });
  if (state === "idle") {
    await detachListeners();
    clearWatchdog();
    clearSilenceTimer();
    return;
  }

  userRequestedStop = true;
  state = "stopping";
  clearWatchdog();
  clearSilenceTimer();

  const gen = currentGen;

  const stopPromise = ScripicSTT.stop().catch((e) => {
    console.warn(`${TAG} plugin.stop threw`, e);
  });

  const timeoutPromise = new Promise<"timeout">((resolve) =>
    setTimeout(() => resolve("timeout"), 1500),
  );

  const result = await Promise.race([stopPromise, timeoutPromise]);

  if (result === "timeout") {
    console.error(`${TAG} [STOP] plugin.stop TIMED OUT (1500ms)`);
    // Force-terminate the session client-side; the native plugin's own
    // force-kill will fire independently.
    if (gen === currentGen) {
      await handleSessionEnd(gen, "user");
    }
  }
  // On normal path, the plugin's "stopped" event drives handleSessionEnd.
}
