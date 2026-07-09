// Native Speech-to-Text wrapper (Capacitor).
//
// The web app keeps using window.webkitSpeechRecognition; this module is only
// used when running inside the Android/iOS shell where the Web Speech API is
// blocked by the WebView permission bridge.
//
// Android's underlying SpeechRecognizer is single-utterance: after a short
// silence the plugin emits `listeningState: "stopped"` and the session ends.
// To give the user a "continuous mic" UX equivalent to the web
// (webkitSpeechRecognition + shouldRestartRef restart loop), this module
// supports autoRestart: on natural end (silence / no-match / speech-timeout)
// it re-invokes SpeechRecognition.start() unless the user pressed stop or a
// fatal error occurred (permission denied, etc.).
//
// The caller receives:
//   - onPartial(text)  — live interim transcript for the CURRENT session only
//   - onCommit(text)   — final transcript of a session, right before it ends
//                        (so the caller can push it into its base buffer and
//                        the next session's partials append cleanly)
//   - onEnd()          — the WHOLE mic session is over (autoRestart exhausted
//                        or stop() was called); UI should turn the mic off.
//   - onError(err)     — non-fatal or fatal error from the plugin.
//
// Every step logs with the `[STT-native]` prefix so field issues on the built
// APK can be diagnosed from adb logcat / Chrome remote devtools.

import { Capacitor } from "@capacitor/core";
import { SpeechRecognition } from "@capacitor-community/speech-recognition";

const TAG = "[STT-native]";

// If no partialResults arrive within this window, we assume the recognizer
// silently died (Android SPEECH_TIMEOUT / NO_MATCH without a stopped event)
// and force a restart so the mic button doesn't freeze.
const WATCHDOG_MS = 8000;

// Guardrail: never restart more than this in a row without a partial. Prevents
// a hot loop when the mic is truly broken (e.g. permission revoked mid-session).
const MAX_CONSECUTIVE_EMPTY_RESTARTS = 3;

type SessionState = "idle" | "starting" | "listening" | "stopping";

type Handlers = {
  onPartial: (text: string) => void;
  onCommit?: (text: string) => void;
  onEnd: () => void;
  onError?: (err: unknown) => void;
};

type StartOptions = { autoRestart?: boolean };

type ListenerHandle = { remove?: () => Promise<void> | void };

// --- module-level session state (only one session at a time) ---
let state: SessionState = "idle";
let currentGen = 0; // increments on every start; stale events are dropped

let partialHandle: ListenerHandle | null = null;
let stateHandle: ListenerHandle | null = null;
let errorHandle: ListenerHandle | null = null;

let watchdogTimer: ReturnType<typeof setTimeout> | null = null;
let sawPartialThisSession = false;
let lastPartialText = "";
let partialCount = 0;
let consecutiveEmptyRestarts = 0;

let userRequestedStop = false;
let currentLang = "en-US";
let currentAutoRestart = false;
let currentHandlers: Handlers | null = null;

export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

export async function isNativeSTTAvailable(): Promise<boolean> {
  if (!isNativePlatform()) {
    console.log(`${TAG} available? not a native platform`);
    return false;
  }
  try {
    const r = await SpeechRecognition.available();
    console.log(`${TAG} available?`, { supported: !!r?.available });
    return !!r.available;
  } catch (e) {
    console.warn(`${TAG} available? threw`, e);
    return false;
  }
}

export async function ensureSTTPermission(): Promise<boolean> {
  try {
    const before = await SpeechRecognition.checkPermissions();
    if (before.speechRecognition === "granted") {
      console.log(`${TAG} permission`, { before: before.speechRecognition, granted: true });
      return true;
    }
    const after = await SpeechRecognition.requestPermissions();
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

function armWatchdog(gen: number) {
  clearWatchdog();
  watchdogTimer = setTimeout(() => {
    if (gen !== currentGen) return;
    if (sawPartialThisSession) return;
    console.warn(`${TAG} watchdog fired (no partial in ${WATCHDOG_MS}ms) → force stop for restart`);
    // Force plugin.stop() so the stopped event fires and the restart branch
    // in the state listener kicks in.
    SpeechRecognition.stop().catch(() => {
      // If stop fails, synthesize an end so the UI is not left stuck.
      handleSessionEnd(gen, "watchdog");
    });
  }, WATCHDOG_MS);
}

async function detachListeners() {
  const targets = [
    ["partial", partialHandle],
    ["state", stateHandle],
    ["error", errorHandle],
  ] as const;
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

// Called exactly once per underlying plugin session when it truly ends.
// Decides whether to autoRestart or terminate the whole mic UX session.
function handleSessionEnd(gen: number, reason: "user" | "silence" | "error" | "watchdog") {
  if (gen !== currentGen) {
    console.log(`${TAG} session end ignored (stale gen)`, { gen, currentGen, reason });
    return;
  }
  clearWatchdog();

  const handlers = currentHandlers;

  // Push whatever partial we had as a "commit" so the caller can freeze it
  // into its base buffer before the next session starts fresh.
  if (handlers?.onCommit && lastPartialText) {
    try {
      handlers.onCommit(lastPartialText);
    } catch (e) {
      console.warn(`${TAG} onCommit threw`, e);
    }
  }

  const willRestart =
    currentAutoRestart &&
    !userRequestedStop &&
    reason !== "error" &&
    consecutiveEmptyRestarts < MAX_CONSECUTIVE_EMPTY_RESTARTS;

  console.log(`${TAG} session end`, {
    reason,
    willRestart,
    sawPartialThisSession,
    consecutiveEmptyRestarts,
    partialCount,
  });

  if (!willRestart) {
    // Full stop: detach and notify caller.
    state = "idle";
    userRequestedStop = false;
    consecutiveEmptyRestarts = 0;
    void detachListeners();
    try {
      handlers?.onEnd();
    } catch (e) {
      console.warn(`${TAG} onEnd threw`, e);
    }
    currentHandlers = null;
    return;
  }

  // Restart in place: reuse the same gen/handlers, reset per-session fields.
  if (!sawPartialThisSession) {
    consecutiveEmptyRestarts++;
  } else {
    consecutiveEmptyRestarts = 0;
  }
  sawPartialThisSession = false;
  lastPartialText = "";
  partialCount = 0;
  state = "starting";
  console.log(`${TAG} restart attempt`, { consecutiveEmptyRestarts });

  SpeechRecognition.start({
    language: currentLang,
    partialResults: true,
    popup: false,
  })
    .then(() => {
      if (gen !== currentGen) return;
      state = "listening";
      console.log(`${TAG} plugin.start OK (restart)`);
      armWatchdog(gen);
    })
    .catch((err) => {
      if (gen !== currentGen) return;
      console.error(`${TAG} plugin.start FAIL (restart)`, err);
      // Give up on the whole mic session.
      state = "idle";
      userRequestedStop = false;
      consecutiveEmptyRestarts = 0;
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
    });
}

export async function startNativeSTT(
  lang: string,
  h: Handlers,
  opts: StartOptions = {},
): Promise<void> {
  // If a previous session is still around, tear it down first.
  if (state !== "idle") {
    console.log(`${TAG} start requested while state=${state} → tearing down previous`);
    userRequestedStop = true;
    try {
      await SpeechRecognition.stop();
    } catch {
      /* noop */
    }
    await detachListeners();
    clearWatchdog();
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
  state = "starting";

  console.log(`${TAG} start requested`, { lang, gen, autoRestart: currentAutoRestart });

  // --- attach listeners BEFORE start() so no event is missed ---
  try {
    partialHandle = await SpeechRecognition.addListener(
      "partialResults",
      (data: { matches?: string[] }) => {
        if (gen !== currentGen) return;
        const m = data?.matches?.[0];
        if (typeof m !== "string") return;
        sawPartialThisSession = true;
        lastPartialText = m;
        partialCount++;
        if (partialCount <= 3 || partialCount % 10 === 0) {
          console.log(`${TAG} partial#${partialCount}`, {
            len: m.length,
            text: m.length > 40 ? m.slice(0, 40) + "…" : m,
          });
        }
        // Reset watchdog every time we hear something.
        armWatchdog(gen);
        try {
          h.onPartial(m);
        } catch (e) {
          console.warn(`${TAG} onPartial threw`, e);
        }
      },
    );

    stateHandle = await SpeechRecognition.addListener(
      "listeningState",
      (data: { status?: string }) => {
        if (gen !== currentGen) return;
        console.log(`${TAG} listeningState`, data);
        if (data?.status === "stopped") {
          handleSessionEnd(gen, userRequestedStop ? "user" : "silence");
        }
      },
    );

    // Not all platform versions emit this, but subscribe defensively — this
    // is the fix for "mic button freezes when user doesn't speak".
    try {
      errorHandle = await (SpeechRecognition as any).addListener(
        "error",
        (data: any) => {
          if (gen !== currentGen) return;
          console.warn(`${TAG} error event`, data);
          const code = data?.code ?? data?.error ?? "unknown";
          const message = data?.message ?? String(code);
          const fatal =
            String(code).includes("not-allowed") ||
            String(code).includes("permission") ||
            code === 9 /* INSUFFICIENT_PERMISSIONS on Android */;
          try {
            h.onError?.({ code, message, fatal });
          } catch {
            /* noop */
          }
          if (fatal) {
            userRequestedStop = true; // suppress autoRestart
          }
          handleSessionEnd(gen, "error");
        },
      );
    } catch (e) {
      // Plugin version may not expose "error" — that's ok, watchdog covers it.
      console.log(`${TAG} error listener not supported by plugin`, e);
      errorHandle = null;
    }

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

  // --- actually start the recognizer ---
  try {
    await SpeechRecognition.start({
      language: lang,
      partialResults: true,
      popup: false,
    });
    if (gen !== currentGen) return;
    state = "listening";
    console.log(`${TAG} plugin.start OK`);
    armWatchdog(gen);
  } catch (err) {
    console.error(`${TAG} plugin.start FAIL`, err);
    await detachListeners();
    clearWatchdog();
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
    // Nothing to stop, but make sure any dangling listeners are gone.
    await detachListeners();
    clearWatchdog();
    return;
  }
  userRequestedStop = true;
  state = "stopping";
  clearWatchdog();
  try {
    await SpeechRecognition.stop();
  } catch (e) {
    console.warn(`${TAG} plugin.stop threw`, e);
  }
  // The "listeningState: stopped" event should fire and drive handleSessionEnd.
  // But if the plugin swallowed it, force cleanup after a short grace window.
  const gen = currentGen;
  setTimeout(() => {
    if (gen !== currentGen) return;
    if (state !== "idle") {
      console.warn(`${TAG} stop grace elapsed without stopped event → force end`);
      handleSessionEnd(gen, "user");
    }
  }, 500);
  await detachListeners();
}
