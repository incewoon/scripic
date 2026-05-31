// Single entry point for AI calls.
//
// All AI traffic goes through Firebase Cloud Functions callables
// (`chat`, `generateAlbum`) — enforced by App Check + per-device daily limit.
// Prompts are assembled server-side; the client only forwards the
// conversation, photos, and locale/mode metadata.

import { httpsCallable, FunctionsError } from "firebase/functions";
import { getFns } from "@/integrations/firebase/client";
import { ensureFirebaseUser } from "@/integrations/firebase/auth";
import { canCreateAlbumToday, getDeviceId, todayKey } from "./dailyLimit";

type CallableErrorShape = { code: string; message: string };

function normalizeError(e: unknown): never {
  // Firebase SDK throws FunctionsError with `code` like "functions/resource-exhausted".
  if (e instanceof FunctionsError) {
    const err: any = new Error(e.message);
    // Already namespaced: "functions/<code>"
    err.code = e.code.startsWith("functions/") ? e.code : `functions/${e.code}`;
    err.details = (e as any).details; // preserve { kind: "ai_quota" | "daily_limit", ... }
    throw err;
  }
  if (typeof e === "object" && e !== null && "code" in e) {
    const ce = e as CallableErrorShape & { details?: any };
    const err: any = new Error(ce.message || "callable_error");
    err.code = ce.code.startsWith("functions/") ? ce.code : `functions/${ce.code}`;
    err.details = ce.details;
    throw err;
  }
  throw e instanceof Error ? e : new Error(String(e));
}

// ---------------- chat ----------------
// Uses Firebase v12 streaming callables so server-side `response.sendChunk({ delta })`
// arrives token-by-token (first token in ~1s instead of waiting for the entire reply).
export async function* aiChatStream(payload: {
  messages: any[];
  photos?: string[];
  photoCount: number;
  lang: string;
  mode: string;
  maxTurnsPerPhoto?: number;
}): AsyncGenerator<string> {
  const startTime = performance.now();
  console.log(`[AI Client] aiChatStream → callable chat (stream)`);

  await ensureFirebaseUser(); // anonymous sign-in (also ensures App Check is initialized)

  const call = httpsCallable<any, { text: string }, { delta?: string }>(
    getFns(),
    "chat",
  );

  try {
    const { stream, data } = await call.stream({
      messages: payload.messages,
      photos: payload.photos,
      photoCount: payload.photoCount,
      lang: payload.lang,
      mode: payload.mode,
      maxTurnsPerPhoto: payload.maxTurnsPerPhoto ?? 3,
      deviceId: getDeviceId(),
    });

    let firstChunkAt: number | null = null;
    for await (const chunk of stream) {
      const delta = chunk?.delta;
      if (typeof delta === "string" && delta.length > 0) {
        if (firstChunkAt == null) {
          firstChunkAt = performance.now();
          console.log(
            `[AI Client] aiChatStream 첫 토큰 - ${(firstChunkAt - startTime).toFixed(0)}ms`,
          );
        }
        yield delta;
      }
    }
    await data; // surface server-side errors that fire after streaming begins
    const endTime = performance.now();
    console.log(
      `[AI Client] aiChatStream 완료 - ${(endTime - startTime).toFixed(0)}ms`,
    );
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
  const today = todayKey();
  return { used, limit: 1, today };
}
