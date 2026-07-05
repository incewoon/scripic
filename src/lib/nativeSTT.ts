// Native Speech-to-Text wrapper (Capacitor).
// The web app keeps using window.webkitSpeechRecognition; this module is only
// used when running inside the Android/iOS shell where the Web Speech API is
// blocked by the WebView permission bridge.
//
// Android's underlying SpeechRecognizer is single-utterance: after a short
// silence the plugin emits `listeningState: "stopped"` and the session ends.
// We do NOT auto-restart here — the caller (chat.tsx) treats each session as
// a single utterance and requires the user to tap the mic again to continue.

import { Capacitor } from "@capacitor/core";
import { SpeechRecognition } from "@capacitor-community/speech-recognition";

export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

export async function isNativeSTTAvailable(): Promise<boolean> {
  if (!isNativePlatform()) return false;
  try {
    const r = await SpeechRecognition.available();
    return !!r.available;
  } catch {
    return false;
  }
}

export async function ensureSTTPermission(): Promise<boolean> {
  try {
    const perm = await SpeechRecognition.checkPermissions();
    if (perm.speechRecognition === "granted") return true;
    const req = await SpeechRecognition.requestPermissions();
    return req.speechRecognition === "granted";
  } catch {
    return false;
  }
}

type Handlers = {
  onPartial: (text: string) => void;
  onEnd: () => void;
  onError?: (err: unknown) => void;
};

let partialHandle: { remove?: () => Promise<void> | void } | null = null;
let stateHandle: { remove?: () => Promise<void> | void } | null = null;
let endFired = false;

async function detachListeners() {
  try {
    await partialHandle?.remove?.();
  } catch {
    /* noop */
  }
  try {
    await stateHandle?.remove?.();
  } catch {
    /* noop */
  }
  partialHandle = null;
  stateHandle = null;
}

export async function startNativeSTT(lang: string, h: Handlers): Promise<void> {
  // 이전 세션이 남아있으면 정리
  await detachListeners();
  endFired = false;

  const fireEnd = () => {
    if (endFired) return;
    endFired = true;
    try {
      h.onEnd();
    } catch {
      /* noop */
    }
  };

  partialHandle = await SpeechRecognition.addListener(
    "partialResults",
    (data: { matches?: string[] }) => {
      const m = data?.matches?.[0];
      if (typeof m === "string") h.onPartial(m);
    },
  );
  stateHandle = await SpeechRecognition.addListener(
    "listeningState",
    (data: { status?: string }) => {
      if (data?.status === "stopped") fireEnd();
    },
  );

  try {
    // Android: partialResults=true 면 start() 는 즉시 리턴하고 이벤트로 결과가 온다.
    // iOS: 마찬가지로 스트리밍.
    await SpeechRecognition.start({
      language: lang,
      partialResults: true,
      popup: false,
    });
  } catch (err) {
    // start 실패 시 리스너 정리하고 에러를 위로 전달
    await detachListeners();
    endFired = true;
    h.onError?.(err);
    throw err;
  }
}

export async function stopNativeSTT(): Promise<void> {
  try {
    // stop() 완료까지 대기 → listeningState:"stopped" 이벤트가 확실히 발화하도록.
    await SpeechRecognition.stop();
  } catch {
    /* noop */
  }
  // stop 이 완료된 후에 리스너를 정리해야 stopped 이벤트가 유실되지 않는다.
  await detachListeners();
  endFired = true;
}
