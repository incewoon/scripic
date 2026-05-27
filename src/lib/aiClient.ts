// Single entry point for AI calls.
//
// All AI traffic goes through Firebase Cloud Functions callables
// (`chat`, `generateAlbum`) — enforced by App Check + per-device daily limit.
// Prompts are assembled server-side; the client only forwards the
// conversation, photos, and locale/mode metadata.

import { httpsCallable, FunctionsError } from "firebase/functions";
import { getFns } from "@/integrations/firebase/client";
import { ensureFirebaseUser } from "@/integrations/firebase/auth";
import { canCreateAlbumToday, getDeviceId } from "./dailyLimit";

type CallableErrorShape = { code: string; message: string };

function normalizeError(e: unknown): never {
  // Firebase SDK throws FunctionsError with `code` like "functions/resource-exhausted".
  if (e instanceof FunctionsError) {
    const err: any = new Error(e.message);
    // Already namespaced: "functions/<code>"
    err.code = e.code.startsWith("functions/") ? e.code : `functions/${e.code}`;
    throw err;
  }
  if (typeof e === "object" && e !== null && "code" in e) {
    const ce = e as CallableErrorShape;
    const err: any = new Error(ce.message || "callable_error");
    err.code = ce.code.startsWith("functions/") ? ce.code : `functions/${ce.code}`;
    throw err;
  }
  throw e instanceof Error ? e : new Error(String(e));
}

// ---------------- chat ----------------
export async function* aiChatStream(payload: {
  messages: any[];
  photos?: string[];
  photoCount: number;
  lang: string;
  mode: string;
  maxTurnsPerPhoto?: number;
}): AsyncGenerator<string> {
  const startTime = performance.now();
  console.log(`[AI Client] aiChatStream → callable chat`);

  await ensureFirebaseUser(); // anonymous sign-in (also ensures App Check is initialized)

  const call = httpsCallable<any, { text: string }>(getFns(), "chat");

  try {
    const res = await call({
      messages: payload.messages,
      photos: payload.photos,
      photoCount: payload.photoCount,
      lang: payload.lang,
      mode: payload.mode,
      maxTurnsPerPhoto: payload.maxTurnsPerPhoto ?? 3,
      deviceId: getDeviceId(),
    });
    const text = res.data?.text ?? "";
    const endTime = performance.now();
    console.log(`[AI Client] aiChatStream 완료 - ${(endTime - startTime).toFixed(0)}ms`);
    if (text) yield text;
  } catch (e) {
    console.error(`[AI Client] aiChatStream 실패`, e);
    normalizeError(e);
  }
}

// ---------------- generateAlbum ----------------
export async function aiGenerateAlbum(payload: {
  messages: any[];
  photoCount: number;
  lang: string;
  period?: string;
  location?: string;
  mode: string;
  tone: string;
}): Promise<any> {
  const startTime = performance.now();
  console.log(`[AI Client] aiGenerateAlbum → callable generateAlbum`);

  await ensureFirebaseUser();

  const call = httpsCallable<any, any>(getFns(), "generateAlbum");

  try {
    const res = await call({
      messages: payload.messages,
      photoCount: payload.photoCount,
      lang: payload.lang,
      period: payload.period,
      location: payload.location,
      mode: payload.mode,
      tone: payload.tone,
      deviceId: getDeviceId(),
    });
    const endTime = performance.now();
    console.log(`[AI Client] aiGenerateAlbum 완료 - ${(endTime - startTime).toFixed(0)}ms`);
    return res.data;
  } catch (e) {
    console.error(`[AI Client] aiGenerateAlbum 실패`, e);
    normalizeError(e);
  }
}

// ---------------- dailyStatus ----------------
// Optimistic UI-only readout. The server is the source of truth (and will
// reject with `resource-exhausted` if the local cache lies).
export async function aiDailyStatus(): Promise<{
  used: number;
  limit: number;
  today: string;
}> {
  const used = canCreateAlbumToday() ? 0 : 1;
  const today = new Date().toISOString().slice(0, 10);
  return { used, limit: 1, today };
}
