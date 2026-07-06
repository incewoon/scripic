// src/lib/aiClient.ts
// Single entry point for AI calls.
//
// All AI traffic goes through Firebase Cloud Functions callables
// (`chat`, `generateAlbum`) — enforced by App Check + per-device daily limit.
// Prompts are assembled server-side; the client only forwards the
// conversation, photos, and locale/mode metadata.

import { httpsCallable, FunctionsError } from "firebase/functions";
import { getFns } from "@/integrations/firebase/client";
import { ensureFirebaseUser } from "@/integrations/firebase/auth";
import { canCreateAlbumToday, getDeviceId, getLocalDate, todayKey } from "./dailyLimit";

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
  const msgCount = payload.messages?.length ?? 0;
  const photoBytes = (payload.photos ?? []).reduce(
    (a, p) => a + (typeof p === "string" ? p.length : 0),
    0,
  );
  console.log(`[AI Client] ▶ aiChatStream 시작`, {
    msgCount,
    photoCount: payload.photoCount,
    photosInPayload: payload.photos?.length ?? 0,
    photoPayloadBytes: photoBytes,
    lang: payload.lang,
    mode: payload.mode,
  });

  try {
    console.log(`[AI Client] ensureFirebaseUser() 대기…`);
    const authUser = await ensureFirebaseUser();
    console.log(`[AI Client] ensureFirebaseUser() OK`, {
      uid: authUser?.uid,
      isAnonymous: authUser?.isAnonymous,
      ms: (performance.now() - startTime).toFixed(0),
    });
  } catch (e: any) {
    console.error(`[AI Client] ensureFirebaseUser() 실패`, {
      code: e?.code,
      message: e?.message,
      name: e?.name,
    });
    normalizeError(e);
  }

  const call = httpsCallable<any, { text: string }, { delta?: string; replace?: string }>(
    getFns(),
    "chat",
  );
  console.log(`[AI Client] httpsCallable('chat') 준비 완료 — call.stream() 호출`);

  try {
    const { stream, data } = await call.stream({
      messages: payload.messages,
      photos: payload.photos,
      photoCount: payload.photoCount,
      lang: payload.lang,
      mode: payload.mode,
      maxTurnsPerPhoto: payload.maxTurnsPerPhoto ?? 3,
      deviceId: getDeviceId(),
      localDate: getLocalDate(),
    });
    console.log(
      `[AI Client] call.stream() 반환 — ${(performance.now() - startTime).toFixed(0)}ms, 스트림 소비 시작`,
    );

    let firstChunkAt: number | null = null;
    let chunkIdx = 0;
    let totalDeltaChars = 0;
    let replaceCount = 0;
    for await (const chunk of stream) {
      chunkIdx++;
      if (firstChunkAt == null) {
        firstChunkAt = performance.now();
        console.log(
          `[AI Client] 🟢 첫 토큰 수신 - ${(firstChunkAt - startTime).toFixed(0)}ms`,
          { chunkKeys: chunk ? Object.keys(chunk) : null },
        );
      }
      if (typeof chunk?.replace === "string") {
        replaceCount++;
        console.log(`[AI Client] chunk#${chunkIdx} REPLACE(len=${chunk.replace.length})`);
        yield `\x00REPLACE\x00${chunk.replace}`;
      } else {
        const delta = chunk?.delta;
        if (typeof delta === "string" && delta.length > 0) {
          totalDeltaChars += delta.length;
          if (chunkIdx <= 3 || chunkIdx % 20 === 0) {
            console.log(
              `[AI Client] chunk#${chunkIdx} delta(len=${delta.length}, total=${totalDeltaChars})`,
            );
          }
          yield delta;
        } else {
          console.warn(`[AI Client] chunk#${chunkIdx} 빈/비정상`, chunk);
        }
      }
    }
    console.log(
      `[AI Client] 스트림 루프 종료 — chunks=${chunkIdx}, deltaChars=${totalDeltaChars}, replaces=${replaceCount}. data 프로미스 await…`,
    );
    const finalData: any = await data;
    console.log(
      `[AI Client] ✅ aiChatStream 완료 - ${(performance.now() - startTime).toFixed(0)}ms`,
      { finalTextLen: finalData?.text?.length ?? null },
    );
  } catch (e: any) {
    console.error(`[AI Client] ❌ aiChatStream 실패`, {
      name: e?.name,
      code: e?.code,
      message: e?.message,
      details: e?.details,
      elapsedMs: (performance.now() - startTime).toFixed(0),
    });
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
      localDate: getLocalDate(),
    });
    const endTime = performance.now();
    console.log(`[AI Client] aiGenerateAlbum 완료 - ${(endTime - startTime).toFixed(0)}ms`);
    return res.data;
  } catch (e: any) {
    console.error(`[AI Client] ❌ aiGenerateAlbum 실패`, {
      name: e?.name,
      code: e?.code,
      message: e?.message,
      details: e?.details,
      elapsedMs: (performance.now() - startTime).toFixed(0),
    });
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
