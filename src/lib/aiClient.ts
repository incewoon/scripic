// Single entry point for AI calls. Routes everything through Firebase
// Cloud Functions (callable). The Gemini API key never reaches the client.
//
// `chat` returns an async iterable of text deltas (streaming).
// `generateAlbum` returns the parsed album JSON.
// `dailyStatus` returns the per-device daily-album counter.

import { httpsCallable } from "firebase/functions";
import { getFns, isFirebaseReady } from "@/integrations/firebase/client";
import { getDeviceId } from "./dailyLimit";

function withDevice<T extends object>(payload: T): T & { deviceId: string } {
  return { ...payload, deviceId: getDeviceId() };
}

export async function* aiChatStream(payload: {
  messages: any[];
  photos?: string[];
  photoCount: number;
  lang: string;
  mode: string;
  maxTurnsPerPhoto?: number;
}): AsyncGenerator<string> {
  if (!isFirebaseReady()) throw new Error("firebase_not_configured");
  const fn = httpsCallable(getFns(), "chat");
  // streamCallable: iterate stream of {delta} chunks, then resolve with full text.
  const res = (fn as any).stream
    ? await (fn as any).stream(withDevice(payload))
    : null;

  if (res?.stream) {
    for await (const chunk of res.stream as AsyncIterable<any>) {
      if (chunk?.delta) yield String(chunk.delta);
    }
    await res.data; // surface server-side errors
    return;
  }

  // Fallback: non-streaming call returns full text in one shot.
  const r = await fn(withDevice(payload));
  const text = (r.data as any)?.text ?? "";
  if (text) yield text;
}

export async function aiGenerateAlbum(payload: {
  messages: any[];
  photoCount: number;
  lang: string;
  period?: string;
  location?: string;
  mode: string;
  tone: string;
}): Promise<any> {
  if (!isFirebaseReady()) throw new Error("firebase_not_configured");
  const fn = httpsCallable(getFns(), "generateAlbum");
  const r = await fn(withDevice(payload));
  return r.data;
}

export async function aiDailyStatus(): Promise<{ used: number; limit: number; today: string }> {
  if (!isFirebaseReady()) throw new Error("firebase_not_configured");
  const fn = httpsCallable(getFns(), "dailyStatus");
  const r = await fn(withDevice({}));
  return r.data as any;
}
