// Native Speech-to-Text wrapper (Capacitor).
// The web app keeps using window.webkitSpeechRecognition; this module is only
// used when running inside the Android/iOS shell where the Web Speech API is
// blocked by the WebView permission bridge.

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
};

let partialHandle: { remove?: () => Promise<void> | void } | null = null;
let stateHandle: { remove?: () => Promise<void> | void } | null = null;

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
  await detachListeners();
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
      if (data?.status === "stopped") h.onEnd();
    },
  );
  await SpeechRecognition.start({
    language: lang,
    partialResults: true,
    popup: false,
  });
}

export async function stopNativeSTT(): Promise<void> {
  try {
    await SpeechRecognition.stop();
  } catch {
    /* noop */
  }
  await detachListeners();
}
