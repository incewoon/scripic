// src/lib/aiClient.ts
// Single entry point for AI calls.
//
// All AI traffic goes through Firebase Cloud Functions callables
// (`chat`, `generateAlbum`) — enforced by App Check + per-device daily limit.
//
// Observability:
//   Every call logs a `[AI Client] prewarm snapshot` line up front (was the
//   auth+AppCheck sidecar prewarm done before the user entered chat?), then
//   per-phase timings (auth / callable_setup / stream_connect / first_chunk),
//   inter-chunk silence gaps, and a final summary. Each call carries a `rid`
//   so client logs can be joined with the server's `[chat] rid=...` /
//   `[album] rid=...` timing logs.

import { httpsCallable, FunctionsError } from "firebase/functions";
import { getFns } from "@/integrations/firebase/client";
import { ensureFirebaseUser } from "@/integrations/firebase/auth";
import { canCreateAlbumToday, getDeviceId, getLocalDate, todayKey } from "./dailyLimit";
import { prewarmSnapshot } from "./prewarm";

type CallableErrorShape = { code: string; message: string };

// Any inter-chunk gap over this threshold is worth flagging as "the stream
// went silent" — most likely a Gemini stall or worker back-pressure.
const SILENCE_GAP_WARN_MS = 500;

function makeRid(): string {
  try {
    return (globalThis.crypto as any)?.randomUUID?.() ?? Math.random().toString(36).slice(2, 10);
  } catch {
    return Math.random().toString(36).slice(2, 10);
  }
}

function normalizeError(e: unknown): never {
  if (e instanceof FunctionsError) {
    const err: any = new Error(e.message);
    err.code = e.code.startsWith("functions/") ? e.code : `functions/${e.code}`;
    err.details = (e as any).details;
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
export async function* aiChatStream(payload: {
  messages: any[];
  photos?: string[];
  photoCount: number;
  lang: string;
  mode: string;
  maxTurnsPerPhoto?: number;
}): AsyncGenerator<string> {
  const rid = makeRid();
  const t0 = performance.now();
  const msgCount = payload.messages?.length ?? 0;
  const photoBytes = (payload.photos ?? []).reduce(
    (a, p) => a + (typeof p === "string" ? p.length : 0),
    0,
  );

  // Snapshot the sidecar prewarm state — this is the single most useful line
  // when diagnosing "첫 응답 지연" / "연결이 늦어짐" complaints.
  const pw = prewarmSnapshot();
  console.log(`[AI Client] ▶ aiChatStream rid=${rid}`, {
    msgCount,
    photoCount: payload.photoCount,
    photosInPayload: payload.photos?.length ?? 0,
    photoPayloadBytes: photoBytes,
    lang: payload.lang,
    mode: payload.mode,
  });
  console.log(`[AI Client] prewarm snapshot rid=${rid}`, pw);
  if (!pw.wasReady) {
    console.warn(
      `[AI Client] ⚠ prewarm NOT ready at call time rid=${rid} — 사전 워밍이 안 끝난 상태에서 대화로 진입`,
      pw,
    );
  }

  // --- phase: auth ---
  const authT0 = performance.now();
  try {
    const u = await ensureFirebaseUser();
    console.log(`[AI Client] phase=auth ok rid=${rid}`, {
      uid: u?.uid,
      elapsedMs: Math.round(performance.now() - authT0),
    });
  } catch (e: any) {
    console.error(`[AI Client] phase=auth FAIL rid=${rid}`, {
      code: e?.code,
      message: e?.message,
      elapsedMs: Math.round(performance.now() - authT0),
    });
    normalizeError(e);
  }

  // --- phase: callable_setup ---
  const setupT0 = performance.now();
  const call = httpsCallable<any, { text: string }, { delta?: string; replace?: string }>(
    getFns(),
    "chat",
  );
  console.log(`[AI Client] phase=callable_setup ok rid=${rid}`, {
    elapsedMs: Math.round(performance.now() - setupT0),
  });

  try {
    // --- phase: stream_connect ---
    const connectT0 = performance.now();
    const { stream, data } = await call.stream({
      rid,
      messages: payload.messages,
      photos: payload.photos,
      photoCount: payload.photoCount,
      lang: payload.lang,
      mode: payload.mode,
      maxTurnsPerPhoto: payload.maxTurnsPerPhoto ?? 3,
      deviceId: getDeviceId(),
      localDate: getLocalDate(),
    });
    console.log(`[AI Client] phase=stream_connect ok rid=${rid}`, {
      elapsedMs: Math.round(performance.now() - connectT0),
      totalSinceStartMs: Math.round(performance.now() - t0),
    });

    // --- consume stream with gap detection ---
    let firstChunkAt: number | null = null;
    let lastChunkAt: number | null = null;
    let chunkIdx = 0;
    let totalDeltaChars = 0;
    let replaceCount = 0;
    let maxGapMs = 0;
    let gapSum = 0;
    let gapSamples = 0;
    let silenceWarnings = 0;

    for await (const chunk of stream) {
      chunkIdx++;
      const now = performance.now();
      if (firstChunkAt == null) {
        firstChunkAt = now;
        console.log(`[AI Client] phase=first_chunk 🟢 rid=${rid}`, {
          ttfbMs: Math.round(now - t0),
          sinceConnectMs: Math.round(now - connectT0),
        });
      } else if (lastChunkAt != null) {
        const gap = now - lastChunkAt;
        gapSum += gap;
        gapSamples++;
        if (gap > maxGapMs) maxGapMs = gap;
        if (gap > SILENCE_GAP_WARN_MS) {
          silenceWarnings++;
          console.warn(
            `[AI Client] ⚠ silence gap rid=${rid} chunk#${chunkIdx} gapMs=${Math.round(gap)}`,
          );
        }
      }
      lastChunkAt = now;

      if (typeof chunk?.replace === "string") {
        replaceCount++;
        console.log(
          `[AI Client] chunk#${chunkIdx} REPLACE rid=${rid} len=${chunk.replace.length}`,
        );
        yield `\x00REPLACE\x00${chunk.replace}`;
      } else {
        const delta = chunk?.delta;
        if (typeof delta === "string" && delta.length > 0) {
          totalDeltaChars += delta.length;
          if (chunkIdx <= 3 || chunkIdx % 25 === 0) {
            console.log(
              `[AI Client] chunk#${chunkIdx} delta rid=${rid} len=${delta.length} total=${totalDeltaChars}`,
            );
          }
          yield delta;
        } else {
          console.warn(`[AI Client] chunk#${chunkIdx} 빈/비정상 rid=${rid}`, chunk);
        }
      }
    }

    const finalData: any = await data;
    const doneAt = performance.now();
    console.log(`[AI Client] ✅ aiChatStream done rid=${rid}`, {
      totalMs: Math.round(doneAt - t0),
      ttfbMs: firstChunkAt != null ? Math.round(firstChunkAt - t0) : null,
      streamMs:
        firstChunkAt != null && lastChunkAt != null ? Math.round(lastChunkAt - firstChunkAt) : null,
      chunks: chunkIdx,
      deltaChars: totalDeltaChars,
      replaces: replaceCount,
      maxGapMs: Math.round(maxGapMs),
      avgGapMs: gapSamples ? Math.round(gapSum / gapSamples) : null,
      silenceGapWarnings: silenceWarnings,
      finalTextLen: finalData?.text?.length ?? null,
    });
  } catch (e: any) {
    console.error(`[AI Client] ❌ aiChatStream FAIL rid=${rid}`, {
      name: e?.name,
      code: e?.code,
      message: e?.message,
      details: e?.details,
      elapsedMs: Math.round(performance.now() - t0),
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
  const rid = makeRid();
  const t0 = performance.now();
  const pw = prewarmSnapshot();
  console.log(`[AI Client] ▶ aiGenerateAlbum rid=${rid}`, {
    msgCount: payload.messages?.length ?? 0,
    photoCount: payload.photoCount,
    lang: payload.lang,
    mode: payload.mode,
    tone: payload.tone,
  });
  console.log(`[AI Client] prewarm snapshot rid=${rid}`, pw);
  if (!pw.wasReady) {
    console.warn(
      `[AI Client] ⚠ prewarm NOT ready at album generation rid=${rid}`,
      pw,
    );
  }

  const authT0 = performance.now();
  try {
    await ensureFirebaseUser();
    console.log(`[AI Client] phase=auth ok rid=${rid}`, {
      elapsedMs: Math.round(performance.now() - authT0),
    });
  } catch (e: any) {
    console.error(`[AI Client] phase=auth FAIL rid=${rid}`, {
      code: e?.code,
      message: e?.message,
      elapsedMs: Math.round(performance.now() - authT0),
    });
    normalizeError(e);
  }

  const setupT0 = performance.now();
  const call = httpsCallable<any, any>(getFns(), "generateAlbum");
  console.log(`[AI Client] phase=callable_setup ok rid=${rid}`, {
    elapsedMs: Math.round(performance.now() - setupT0),
  });

  try {
    const roundtripT0 = performance.now();
    const res = await call({
      rid,
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
    const doneAt = performance.now();
    console.log(`[AI Client] ✅ aiGenerateAlbum done rid=${rid}`, {
      totalMs: Math.round(doneAt - t0),
      roundtripMs: Math.round(doneAt - roundtripT0),
    });
    return res.data;
  } catch (e: any) {
    console.error(`[AI Client] ❌ aiGenerateAlbum FAIL rid=${rid}`, {
      name: e?.name,
      code: e?.code,
      message: e?.message,
      details: e?.details,
      elapsedMs: Math.round(performance.now() - t0),
    });
    normalizeError(e);
  }
}

// ---------------- dailyStatus ----------------
export async function aiDailyStatus(): Promise<{
  used: number;
  limit: number;
  today: string;
}> {
  const used = canCreateAlbumToday() ? 0 : 1;
  const today = todayKey();
  return { used, limit: 1, today };
}
