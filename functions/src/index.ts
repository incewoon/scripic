// functions/src/index.ts
// Cloud Functions for Firebase — proxy for Gemini 2.5 Flash-Lite.
//
// All AI traffic from the app goes through these callable functions:
// - chat : streaming interview turns
// - generateAlbum : structured album JSON (title/intro/captions/closing/...)
//
// Security:
// - App Check is ENFORCED (Play Integrity in production, debug token in dev).
// - Daily 1-album limit is counted in Firestore, keyed by App Check appId
//   (falls back to a client-supplied deviceId if App Check is missing).
// - The Gemini API key lives ONLY on the server (functions secret).

import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { setGlobalOptions } from "firebase-functions/v2";
import { createHash, timingSafeEqual } from "crypto";

import { 
  geminiGenerate, 
  geminiStreamText, 
  toGeminiRequest, 
  GeminiRateLimitError, 
  GeminiQuotaError, 
  GeminiUnavailableError, 
  type OpenAIMessage 
} from "./gemini";
import { chatSystemPrompt, turnLimitClause, type Mode } from "./prompts-chat";
import { albumSystem, albumUserPrompt, toneInstruction, type Mode as AlbumMode, type Tone } from "./prompts-album";
import { computePHash, minHammingDistance } from "./phash";

// pHash duplicate detection thresholds for review screenshots.
// 256-bit dHash: ~11% threshold. Legacy 64-bit hashes auto-skip via length mismatch.
const PHASH_DUP_DISTANCE = 28;
const PHASH_MAX_STORED = 200;
const PHASH_VERSION = 2;

initializeApp();
const db = getFirestore();

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");
const EASTER_EGG_ANSWER = defineSecret("EASTER_EGG_ANSWER");

setGlobalOptions({
  region: "us-central1",
  maxInstances: 10,
  memory: "512MiB",
  timeoutSeconds: 120,
});

// ---------------- helpers ----------------

/**
 * Day key for daily limits — supplied by the client in the user's LOCAL timezone
 * as "YYYY-MM-DD". The server validates the format and that it's within ±1 day
 * of the server's UTC date (covers any timezone offset on Earth).
 */
function validateClientDate(clientDate: unknown): string {
  // 교정: 정규식 끝부분의 백틱 오타 구문(\d{2}$`)을 올바른 종료 앵커(\d{2}$)로 수정했습니다.
  if (typeof clientDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(clientDate)) {
    throw new HttpsError("invalid-argument", "invalid date format");
  }
  const today = new Date();
  const dates = [-1, 0, 1].map((offset) => {
    const d = new Date(today.getTime() + offset * 86400000);
    return d.toISOString().slice(0, 10);
  });
  if (!dates.includes(clientDate)) {
    throw new HttpsError("invalid-argument", "date out of range");
  }
  return clientDate;
}

/**
 * Stable identifier for rate-limiting. Prefer the client-supplied deviceId
 * (per-install UUID stored in localStorage) so the counter is independent
 * across phones/tablets. App Check appId is the SAME for every install of
 * the app, so it must only be used as a last-resort fallback.
 */
function rateLimitKey(req: { app?: { appId?: string }; data?: any }): string {
  const deviceId = String(req.data?.deviceId ?? "").slice(0, 128);
  // 교정: 깨진 문자열 및 분기 구문을 백틱과 올바른 개행 구조로 정비했습니다.
  if (deviceId) {
    return `dev:${deviceId}`;
  }
  const appId = req.app?.appId;
  if (appId) {
    return `app:${appId}`;
  }
  throw new HttpsError("failed-precondition", "missing device id and app check token");
}

/**
 * Reserve today's album slot atomically. Throws if already used today.
 * Limit is normally 1/day, raised to 2 if a review-bonus was granted today.
 * Pass commit=false to only PEEK (used by /chat which shouldn't burn a slot).
 */
async function reserveDailyAlbum(key: string, today: string, commit: boolean): Promise<void> {
  const docRef = db.collection("daily_limits").doc(key);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(docRef);
    const data = snap.data();
    const sameDay = data?.lastDate === today;
    const usedToday = sameDay ? (data?.count ?? 0) : 0;
    const bonusToday = sameDay && data?.bonusGranted === true;
    const limit = bonusToday ? 2 : 1;
    if (usedToday >= limit) {
      throw new HttpsError("resource-exhausted", "daily_limit_reached", {
        kind: "daily_limit",
        usedToday,
        limit,
      });
    }
    if (!commit) return;
    if (sameDay) {
      tx.update(docRef, { count: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() });
    } else {
      tx.set(docRef, { lastDate: today, count: 1, bonusGranted: false, updatedAt: FieldValue.serverTimestamp() });
    }
  });
}

const DAILY_CHAT_LIMIT = 30; // 하루 최대 대화 턴 수 (원하시면 조정)

async function reserveChatTurn(key: string, today: string): Promise<void> {
  const docRef = db.collection("daily_limits").doc(key);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(docRef);
    const data = snap.data();
    const sameDay = data?.lastDate === today;
    const chatCount = sameDay ? (data?.chatCount ?? 0) : 0;

    if (chatCount >= DAILY_CHAT_LIMIT) {
      throw new HttpsError("resource-exhausted", "daily_chat_limit_reached", {
        kind: "daily_chat_limit",
        used: chatCount,
        limit: DAILY_CHAT_LIMIT,
      });
    }

    if (sameDay) {
      tx.update(docRef, {
        chatCount: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      // 새로운 날이면 chatCount만 1로 초기화 (앨범 count는 건드리지 않음)
      tx.set(
        docRef,
        {
          lastDate: today,
          chatCount: 1,
          // 기존 필드가 없으면 기본값 유지
          count: data?.count ?? 0,
          bonusGranted: data?.bonusGranted ?? false,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
  });
}


/**
 * Grant a +1 album bonus for today (idempotent: a second call same day reports alreadyGranted).
 */
async function grantDailyBonus(key: string, today: string): Promise<{ alreadyGranted: boolean }> {
  const docRef = db.collection("daily_limits").doc(key);
  return await db.runTransaction(async (tx) => {
    const snap = await tx.get(docRef);
    const data = snap.data();
    const sameDay = data?.lastDate === today;
    if (sameDay && data?.bonusGranted === true) {
      return { alreadyGranted: true };
    }
    if (sameDay) {
      tx.update(docRef, { bonusGranted: true, bonusGrantedAt: FieldValue.serverTimestamp() });
    } else {
      tx.set(docRef, {
        lastDate: today,
        count: 0,
        chatCount: 0,
        bonusGranted: true,
        bonusGrantedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    return { alreadyGranted: false };
  });
}

// ---------------- chat (streaming) ----------------
export const chat = onCall(
  {
    enforceAppCheck: true,
    secrets: [GEMINI_API_KEY],
  },
  // @ts-ignore
  async (request: any, response: any) => {
    const chatT0 = Date.now();
    const {
      rid: ridRaw,
      messages,
      photos,
      photoCount: pcFromClient,
      lang = "en",
      mode,
      maxTurnsPerPhoto: rawCap,
    } = (request.data ?? {}) as {
      rid?: string;
      messages: OpenAIMessage[];
      photos?: string[];
      photoCount?: number;
      lang?: string;
      mode?: Mode;
      maxTurnsPerPhoto?: number;
    };
    const rid = typeof ridRaw === "string" && ridRaw.length ? ridRaw.slice(0, 64) : "-";
    const photoBytes = Array.isArray(photos)
      ? photos.reduce((a, p) => a + (typeof p === "string" ? p.length : 0), 0)
      : 0;

    const key = rateLimitKey(request);
    const today = validateClientDate(request.data?.localDate);

    // ★ 일일 대화 횟수 제한 추가
    await reserveChatTurn(key, today);
    
    // 교정: 템플릿 리터럴 내부 변수 바인딩 구문 오류 수정
    console.log(`[chat] recv rid=${rid} msgs=${messages?.length ?? 0} photoBytes=${photoBytes} lang=${lang} mode=${mode}`);

    if (!Array.isArray(messages) || messages.length === 0) {
      throw new HttpsError("invalid-argument", "messages required");
    }
    if (messages.length > 20) {
      throw new HttpsError("invalid-argument", "too many messages (max 20)");
    }
    for (const msg of messages) {
      if (typeof msg?.content === "string") {
        if (msg.content.length > 4000) {
          throw new HttpsError("invalid-argument", "message too long (max 4000 chars)");
        }
      } else if (Array.isArray(msg?.content)) {
        for (const part of msg.content) {
          if (part?.type === "text" && typeof part.text === "string" && part.text.length > 4000) {
            throw new HttpsError("invalid-argument", "message text too long (max 4000 chars)");
          }
          if (part?.type === "image_url" && typeof part?.image_url?.url === "string" && part.image_url.url.length > 1_500_000) {
            throw new HttpsError("invalid-argument", "embedded image too large (max 1.5MB)");
          }
        }
      }
    }
    if (Array.isArray(photos)) {
      if (photos.length > 5) {
        throw new HttpsError("invalid-argument", "too many photos (max 5)");
      }
      for (const url of photos) {
        if (typeof url !== "string" || url.length > 1_500_000) {
          throw new HttpsError("invalid-argument", "photo too large (max 1.5MB)");
        }
      }
    }

    // 교정: 리터럴 닫는 백틱 유실 문법 수정
    if (mode !== "story" && mode !== "journal" && mode !== "summary") {
      throw new HttpsError("invalid-argument", `invalid mode: ${String(mode)}`);
    }
    const m: Mode = mode;
    const maxTurnsPerPhoto = typeof rawCap === "number" && rawCap > 0 ? Math.min(20, Math.floor(rawCap)) : 3;
    const photoCount = typeof pcFromClient === "number" && pcFromClient > 0 ? pcFromClient : (photos?.length ?? 0);

    const enriched: OpenAIMessage[] = [...messages];
    const hasPhotos = enriched.some((msg) => Array.isArray(msg.content));
    if (!hasPhotos && photos?.length) {
      const idx = enriched.findIndex((msg) => msg.role === "user");
      if (idx >= 0) {
        const txt = typeof enriched[idx].content === "string" ? (enriched[idx].content as string) : "";
        const intro =
          lang === "ko"
            ? `여기 ${photos.length}장의 사진이 있어요. 순서대로 사진 1부터 사진 ${photos.length}까지입니다.`
            : `Here are ${photos.length} photos, labeled Photo 1 through Photo ${photos.length} in order.`;
        
        // 교정: 잘못 표현된 표현식 및 문자열 바인딩 기호 교정
        const content: any[] = [{ type: "text", text: `${intro}\n${txt}` }];
        photos.forEach((url, i) => {
          content.push({ type: "text", text: lang === "ko" ? `사진 ${i + 1}:` : `Photo ${i + 1}:` });
          content.push({ type: "image_url", image_url: { url } });
        });
        enriched[idx] = { role: "user", content };
      }
    }

    const system = chatSystemPrompt(lang, photoCount, m) + turnLimitClause(lang, photoCount, maxTurnsPerPhoto);
    const body = toGeminiRequest([{ role: "system", content: system }, ...enriched]);

    const totalCap = Math.min(12, Math.max(1, photoCount * maxTurnsPerPhoto));
    const assistantSoFar = enriched.filter((msg) => msg.role === "assistant").length;
    const willBeLastTurn = assistantSoFar + 1 >= totalCap;

    function extractText(msg: OpenAIMessage | undefined): string {
      if (!msg) return "";
      if (typeof msg.content === "string") return msg.content;
      if (Array.isArray(msg.content)) {
        const t = msg.content.find((c: any) => c.type === "text") as any;
        return t?.text ?? "";
      }
      return "";
    }
    const lastUserText = extractText([...enriched].reverse().find((m) => m.role === "user"));
    const prevAssistantText = extractText([...enriched].reverse().find((m) => m.role === "assistant"));

    const EXPLICIT_FINISH_KO = /(마무리|정리|완성|마감|끝내|앨범\s만들)\s(해|해줘|해주세요|할래|할까|하자|부탁|좀)?/;
    const EXPLICIT_FINISH_EN =
      /\b(finish (it|this|the album)|wrap (it|this) up|wrap up|finalize|complete (it|the album)|put (it|this|them|these) together|create the album|make the album)\b/i;
    const POSITIVE_KO =
      /(^|\s)(네+|넵+|넹+|예+|응+|웅+|어+|ㅇㅇ+|ㅇㅋ+|오케이|콜|그래(요)?|좋아(요)?|좋습니다|좋지|해(줘|주세요)?|만들어(줘|주세요)?|정리해(줘|주세요)?|마무리해(줘|주세요)?)(\s|[!.~ㅋㅎ]|$)/;
    const POSITIVE_EN =
      /\b(yes|yeah|yep|yup|sure|ok|okay|okey|sounds good|go ahead|do it|please do|let'?s go)\b/i;
    const NEGATIVE_KO =
      /^\s*(아니(요|야)?|아냐|잠깐(만)?|잠시(만)?|기다려(줘)?|아직|싫어|싫|노노|ㄴㄴ|놉|안\s?돼|좀\s?더|더\s?(할래|하자|얘기)|계속)/;
    const NEGATIVE_EN =
      /^\s*(no|nope|nah|wait|hold on|not yet|later|continue|keep going|one more)\b/i;
    const WRAP_HINT_KO =
      /(앨범으로 (정리|마무리)|이대로 (정리|마무리)|정리할까요|마무리할까요|완성할까요|정리해 ?드릴까요|마무리해 ?드릴까요|완성해 ?드릴까요)/;
    const WRAP_HINT_EN =
      /(shall i (put|wrap|finish)|wrap (this|it) up|finish (the|your) album|put (this|these) together|create the album now)/i;
    const WRAP_SENT_KO =
      /(?:^|\n)[^\n]?(?:정리|마무리|완성)\s?(?:해\s?)?(?:드릴까요??|드릴게요.?|할까요??|할게요.?)/g;    
    const WRAP_SENT_EN =
      /(?:^|\n)[^\n]?(?:shall i (?:put|wrap|finish)|let me put|putting (?:it|this|these) together|wrap (?:this|it) up)/gi;

    const userExplicitFinish = EXPLICIT_FINISH_KO.test(lastUserText) || EXPLICIT_FINISH_EN.test(lastUserText);
    const userPositive = POSITIVE_KO.test(lastUserText) || POSITIVE_EN.test(lastUserText);
    const userNegative = NEGATIVE_KO.test(lastUserText) || NEGATIVE_EN.test(lastUserText);
    const wrapProposedPrev =
      prevAssistantText.includes("[PROPOSE_FINISH]") ||
      WRAP_HINT_KO.test(prevAssistantText) ||
      WRAP_HINT_EN.test(prevAssistantText);

    console.log(`[chat] validated rid=${rid} elapsedMs=${Date.now() - chatT0}`);

    let full = "";
    const geminiT0 = Date.now();
    let firstTokenAt: number | null = null;
    let chunkCount = 0;
    try {
      console.log(`[chat] gemini.connect rid=${rid}`); 
      for await (const delta of geminiStreamText(body)) { 
        chunkCount++; 
        if (firstTokenAt == null) { 
          firstTokenAt = Date.now(); 
          console.log(`[chat] gemini.firstToken rid=${rid} ms=${firstTokenAt - geminiT0}`); 
        } 
        full += delta; 
        if (response?.sendChunk) response.sendChunk({ delta }); 
      } 
      console.log(`[chat] gemini.done rid=${rid} tokens=${chunkCount} chars=${full.length}`); 
    } catch (e: any) { 
      console.error(`[chat] fail rid=${rid} error=${e?.constructor?.name} elapsedMs=${Date.now() - chatT0} msg=${e?.message}`);
      if (e instanceof GeminiUnavailableError) {
        throw new HttpsError("unavailable", "ai_unavailable", { kind: "ai_unavailable", status: e.status });
      }
      if (e instanceof GeminiQuotaError || e instanceof GeminiRateLimitError) {
        throw new HttpsError("resource-exhausted", "ai_quota_exhausted", { kind: "ai_quota", status: e.status });
      }
      throw new HttpsError("internal", e?.message ?? "gemini stream failed");
    }

    const trimmedFull = full.trim();
    if (!/\[(READY_TO_FINISH|PROPOSE_FINISH)\]/.test(full) && trimmedFull.length < 6) {
      throw new HttpsError("unavailable", "ai_unavailable", {
        kind: "ai_unavailable",
        reason: "too_short",
      });
    }

    const streamed = full;
    full = full.replace(/\[(READY_TO_FINISH|PROPOSE_FINISH)\]/g, "").trimEnd();

    const stripWrapSentences = (s: string) =>
      s.replace(WRAP_SENT_KO, "").replace(WRAP_SENT_EN, "").replace(/\n{3,}/g, "\n\n").trim();

    // 후처리 테일 삽입 로직 정비
    if (userNegative) {
      // 일반 대화 진행
    } else if (wrapProposedPrev && (userPositive || userExplicitFinish)) {
      full = stripWrapSentences(full);
      const tail = lang === "ko" ? "네, 바로 정리해드릴게요.\n[READY_TO_FINISH]" : "Got it, putting it together now.\n[READY_TO_FINISH]";
      full = full ? `${full}\n\n${tail}` : tail; 
    } else if (userExplicitFinish) { 
      full = stripWrapSentences(full); 
      const tail = lang === "ko" ? "그럼 지금까지 이야기 나눈 내용으로 앨범을 정리해드릴까요?\n[PROPOSE_FINISH]" : "Shall I put together the album based on what we've shared so far?\n[PROPOSE_FINISH]"; 
      full = full ? `${full}\n\n${tail}` : tail; 
    } else if (assistantSoFar + 1 > totalCap) { 
      full = stripWrapSentences(full); 
      const tail = lang === "ko" ? "이제 앨범으로 정리해드릴게요.\n[READY_TO_FINISH]" : "Let me put this together as your album now.\n[READY_TO_FINISH]"; 
      full = full ? `${full}\n\n${tail}` : tail; 
    } else if (willBeLastTurn) { 
      full = stripWrapSentences(full); 
      const tail = lang === "ko" ? "이 정도면 충분히 담을 수 있을 것 같아요. 이대로 앨범으로 정리해드릴까요?\n[PROPOSE_FINISH]" : "I think we have enough now. Shall I put these together into your album?\n[PROPOSE_FINISH]"; 
      full = full ? `${full}\n\n${tail}` : tail;
    }

    const postReplaced = full !== streamed;
    if (response?.sendChunk && postReplaced) {
      response.sendChunk({ replace: full });
    }
    console.log(`[chat] done rid=${rid} replaced=${postReplaced} finalChars=${full.length}`);
    return { text: full };
  },
);

// ---------------- generateAlbum ----------------

const ALBUM_TOOL = {
  functionDeclarations: [
    {
      name: "create_album",
      description: "Album data",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          subtitle: { type: "string" },
          period: { type: "string" },
          location: { type: "string" },
          intro: { type: "string" },
          captions: { type: "array", items: { type: "string" } },
          closing: { type: "string" },
        },
        required: ["title", "subtitle", "intro", "captions", "closing"],
      },
    },
  ],
};

export const generateAlbum = onCall(
  {
    enforceAppCheck: true,
    secrets: [GEMINI_API_KEY],
  },
  async (req) => {
    const albumT0 = Date.now();
    const {
      rid: ridRaw,
      messages,
      photoCount,
      lang = "en",
      period,
      location,
      mode,
      tone,
    } = (req.data ?? {}) as {
      rid?: string;
      messages: { role: string; content: any }[];
      photoCount: number;
      lang?: string;
      period?: string;
      location?: string;
      mode?: AlbumMode;
      tone?: Tone;
    };
    const rid = typeof ridRaw === "string" && ridRaw.length ? ridRaw.slice(0, 64) : "-";
    console.log(`[album] recv rid=${rid} msgs=${messages?.length ?? 0} photoCount=${photoCount} lang=${lang} mode=${mode} tone=${tone}`);

    if (!Array.isArray(messages) || messages.length === 0) {
      throw new HttpsError("invalid-argument", "messages required");
    }
    if (messages.length > 20) {
      throw new HttpsError("invalid-argument", "too many messages (max 20)");
    }
    for (const msg of messages) {
      if (typeof msg?.content === "string" && msg.content.length > 4000) {
        throw new HttpsError("invalid-argument", "message too long (max 4000 chars)");
      } else if (Array.isArray(msg?.content)) {
        for (const part of msg.content) {
          if (part?.type === "text" && typeof part.text === "string" && part.text.length > 4000) {
            throw new HttpsError("invalid-argument", "message text too long (max 4000 chars)");
          }
        }
      }
    }
    if (typeof period === "string" && period.length > 100) {
      throw new HttpsError("invalid-argument", "period too long (max 100 chars)");
    }
    if (typeof location === "string" && location.length > 200) {
      throw new HttpsError("invalid-argument", "location too long (max 200 chars)");
    }
    if (!photoCount || photoCount < 1) throw new HttpsError("invalid-argument", "photoCount required");

    if (mode !== "story" && mode !== "journal" && mode !== "summary") {
      throw new HttpsError("invalid-argument", `invalid mode: ${String(mode)}`); 
    } 
    if (tone !== "politely" && tone !== "friendly" && tone !== "short") { 
      throw new HttpsError("invalid-argument", `invalid tone: ${String(tone)}`);
    }
    const m: AlbumMode = mode;
    const tn: Tone = tone;

    const key = rateLimitKey(req);
    const today = validateClientDate(req.data?.localDate);
    await reserveDailyAlbum(key, today, true);

    const transcript = messages
      .map((msg) => {
        const t =
          typeof msg.content === "string"
            ? msg.content
            : Array.isArray(msg.content)
              ? (msg.content.find?.((c: any) => c.type === "text")?.text ?? "(photos)")
              : "";
        return `${msg.role === "user" ? "Me" : "AI"}: ${t}`;
      })
      .join("\n");

    const system = albumSystem(lang, m) + toneInstruction(lang, tn);
    const userText = albumUserPrompt(lang, photoCount, transcript, m, period, location);

    const body = toGeminiRequest(
      [
        { role: "system", content: system },
        { role: "user", content: userText },
      ],
      {
        tools: [ALBUM_TOOL],
        toolConfig: {
          functionCallingConfig: { mode: "ANY", allowedFunctionNames: ["create_album"] },
        },
      },
    );

    const rollbackDailyCount = async () => {
      try {
        await db.runTransaction(async (tx) => {
          const ref = db.collection("daily_limits").doc(key);
          const snap = await tx.get(ref);
          const data = snap.data();
          if (data?.lastDate === today && (data?.count ?? 0) > 0) {
            tx.update(ref, {
              count: FieldValue.increment(-1),
              updatedAt: FieldValue.serverTimestamp(),
            });
          }
        });
      } catch (e) {
        console.error("[generateAlbum] rollback failed:", (e as any)?.message);
      }
    };

    let result: any;
    try {
      console.log(`[album] gemini.start rid=${rid}`);
      result = await geminiGenerate(body);
      console.log(`[album] gemini.done rid=${rid} elapsedMs=${Date.now() - albumT0}`); 
    } catch (e: any) { 
      console.error(`[album] fail rid=${rid} kind=${e?.status} msg=${e?.message}`); 
      await rollbackDailyCount(); 
      if (e instanceof GeminiUnavailableError) { 
        throw new HttpsError("unavailable", "ai_unavailable", { kind: "ai_unavailable", status: e.status }); 
      } 
      if (e instanceof GeminiQuotaError || e instanceof GeminiRateLimitError) { 
        throw new HttpsError("resource-exhausted", "ai_quota_exhausted", { kind: "ai_quota", status: e.status }); 
      } 
      throw new HttpsError("internal", e?.message ?? "gemini failed"); 
    } 

    const parts = result?.candidates?.[0]?.content?.parts ?? []; 
    const fc = parts.find((p: any) => p.functionCall)?.functionCall; 
    if (!fc?.args) { 
      await rollbackDailyCount(); 
      console.error(`[album] fail rid=${rid} error=no_function_call elapsedMs=${Date.now() - albumT0}`); 
      throw new HttpsError("internal", "gemini did not return album"); 
    } 
    console.log(`[album] done rid=${rid} totalElapsedMs=${Date.now() - albumT0}`);
    return fc.args;
  },
);

// ---------------- dailyStatus (peek) ----------------

export const dailyStatus = onCall({ enforceAppCheck: true }, async (req) => {
  const key = rateLimitKey(req);
  const today = validateClientDate(req.data?.localDate);
  const snap = await db.collection("daily_limits").doc(key).get();
  const data = snap.data();
  const used = data?.lastDate === today ? (data?.count ?? 0) : 0;
  const bonusToday = data?.lastDate === today && data?.bonusGranted === true;
  const limit = bonusToday ? 2 : 1;
  return { used, limit, today, bonusGranted: !!bonusToday };
});

// ---------------- grantReviewReward ----------------

const REVIEW_SYSTEM_PROMPT = `You are the Reward System Agent for a photo-to-album app.
IMPORTANT - The CURRENT brand is ONLY one of these names/domains:
- "Scripic"
- "스크립픽"

Your ONLY job is to decide whether the screenshot is a real social-media review/post
about THIS app that clearly shows the CURRENT brand (Scripic / 스크립픽).

Accepted platforms include Instagram, Facebook, Threads, X (Twitter), TikTok, YouTube,
Naver Blog, Naver Cafe, KakaoStory, Band — any social or community post is fine.

APPROVE only if BOTH are true:
1) The image is clearly a social/community post or review context (not a bare app screen,
   not a private chat, not a meme), AND
2) The image visibly contains at least one of: "Scripic" or "스크립픽"
   (in text, caption, URL, app header, or screenshot embedded in the post).

REJECT (approved=false) when:
- Only generic phrases like "AI album" / "AI 앨범" appear without Scripic / 스크립픽.
- The image is unrelated (food, pet, meme, blank, random screenshot).
- It is just an app screenshot with no review/post wrapper.

Output STRICT JSON only — no markdown fences, no commentary:
{
  "approved": true | false,
  "detected_brand": "scripic" | "generic" | "none",
  "reason": "one short sentence explaining your decision on the user's language ",
  "success_message": "celebration message if approved, otherwise empty string"
}

Pick a success_message similar to(on the user's language):
- "🎉 Wow! Thanks for the great review! An additional album has been provided to you."
- "❤️ Thanks a ton for the review! We've sent an extra album your way."
- "🌟 This is the best review! It made my day to create one more today."
- "🎁 Review verified! You've been granted another album credit." `;

export const grantReviewReward = onCall(
  {
    enforceAppCheck: true,
    secrets: [GEMINI_API_KEY],
  },
  async (req) => {
    const { imageDataUrl, lang = "en" } = (req.data ?? {}) as { imageDataUrl?: string; lang?: string };
    const isKo = lang === "ko";

    if (!imageDataUrl || typeof imageDataUrl !== "string" || !imageDataUrl.startsWith("data:")) {
      throw new HttpsError("invalid-argument", "imageDataUrl required");
    }
    if (imageDataUrl.length > 1_500_000) {
      throw new HttpsError("invalid-argument", "image too large");
    }

    const key = rateLimitKey(req);
    const today = validateClientDate(req.data?.localDate);

    await reserveChatTurn(key, today);
    
    const existing = await db.collection("daily_limits").doc(key).get();
    const exData = existing.data();
    if (exData?.lastDate === today && exData?.bonusGranted === true) {
      return {
        approved: false,
        reason: "already_granted",
        success_message: "",
        daily_limit_info: isKo
          ? "오늘 이미 추가 앨범을 사용하셨습니다. (자정에 초기화됩니다)"
          : "You have already used your extra album today. (Resets at midnight)",
      };
    }

    let phash: string | null = null;
    try {
      phash = await computePHash(imageDataUrl);
    } catch (e: any) {
      console.warn("[reviewReward] phash_failed:", e?.message);
    }
    const hashesRef = db.collection("review_hashes").doc(key);
    if (phash) {
      const snap = await hashesRef.get();
      const stored: string[] = Array.isArray(snap.data()?.hashes) ? (snap.data()!.hashes as string[]) : [];
      const dist = minHammingDistance(phash, stored);
      if (dist < PHASH_DUP_DISTANCE) {
        console.log("[reviewReward] duplicate screenshot, distance=", dist);
        return {
          approved: false,
          reason: isKo
            ? "이미 사용한 후기 이미지예요. 새로운 후기 스크린샷을 올려주세요."
            : "This review screenshot has already been used. Please upload a new screenshot.",
          success_message: "",
          daily_limit_info: "",
        };
      }
    }

    const body = toGeminiRequest([
      { role: "system", content: REVIEW_SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: "Please evaluate this screenshot per the rules above. JSON only." },
          { type: "image_url", image_url: { url: imageDataUrl } },
        ],
      },
    ]);

    let parsed: { approved?: boolean; detected_brand?: string; reason?: string; success_message?: string } = {};
    let rawText = "";
    try {
      const result = await geminiGenerate(body);
      const parts = result?.candidates?.[0]?.content?.parts ?? [];
      rawText = parts
        .map((p: any) => p?.text ?? "")
        .join("\n")
        .trim();
      console.log("[reviewReward] image bytes:", imageDataUrl.length, "raw:", rawText.slice(0, 500));
      const cleaned = rawText
        .replace(/^(?:json)?\s*/i, "").replace(/\s*$/i, "")
        .trim();
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        const s = cleaned.indexOf("{");
        const e = cleaned.lastIndexOf("}");
        if (s >= 0 && e > s) {
          parsed = JSON.parse(cleaned.slice(s, e + 1));
        } else {
          throw new Error("no_json_in_response");
        }
      }
    } catch (e: any) {
      console.error("[reviewReward] verification_failed:", e?.message, "raw:", rawText.slice(0, 500));
      if (e instanceof GeminiUnavailableError) {
        throw new HttpsError("unavailable", "ai_unavailable", { kind: "ai_unavailable", status: e.status });
      }
      if (e instanceof GeminiQuotaError || e instanceof GeminiRateLimitError) {
        throw new HttpsError("resource-exhausted", "ai_quota_exhausted", { kind: "ai_quota", status: e.status });
      }
      return {
        approved: false,
        reason: isKo
          ? "AI 응답을 해석하지 못했어요. 다른 스크린샷으로 다시 시도해주세요."
          : "Could not interpret AI response. Please try again with another screenshot.",
        success_message: "",
        daily_limit_info: "",
      };
    }

    const detected = String(parsed.detected_brand ?? "").toLowerCase();
    const isCurrentBrand = detected === "scripic";
    const isOldOrGeneric = detected === "memory_weaver" || detected === "generic" || detected === "none";

    if (parsed.approved && !isCurrentBrand) {
      console.log("[reviewReward] override-reject: model approved but detected_brand=", detected);
      return {
        approved: false,
        reason: isKo
          ? (isOldOrGeneric || !detected
            ? "이 앱의 현재 브랜드(Scripic / 스크립픽)가 보이지 않아요. 앱이름이 보이는 후기 스크린샷을 올려주세요."
            : "앱이름을 확인하지 못했어요. 다른 스크린샷으로 다시 시도해주세요.")
          : (isOldOrGeneric || !detected
            ? "The current brand name (Scripic) cannot be found. Please upload a screenshot showing the app name."
            : "Could not verify the app name. Please try another screenshot."),
        success_message: "",
        daily_limit_info: "",
      };
    }

    if (!parsed.approved) {
      console.log("[reviewReward] rejected by AI:", parsed.reason, "detected:", detected);
      return {
        approved: false,
        reason: parsed.reason ?? (isKo
          ? "후기 내용을 인식하지 못했어요. 'Scripic'이 보이게 캡처해 주세요."
          : "Review content could not be recognized. Please capture it so 'Scripic' is visible."),
        success_message: "",
        daily_limit_info: "",
      };
    }

    await grantDailyBonus(key, today);

    if (phash) {
      try {
        await hashesRef.set(
          {
            hashes: FieldValue.arrayUnion(phash),
            version: PHASH_VERSION,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
        const after = await hashesRef.get();
        const arr: string[] = Array.isArray(after.data()?.hashes) ? (after.data()!.hashes as string[]) : [];
        if (arr.length > PHASH_MAX_STORED) {
          await hashesRef.update({ hashes: arr.slice(arr.length - PHASH_MAX_STORED) });
        }
      } catch (e: any) {
        console.warn("[reviewReward] hash_store_failed:", e?.message);
      }
    }

    return {
      approved: true,
      reason: parsed.reason ?? "ok",
      success_message: parsed.success_message ?? (isKo
        ? "🎁 와우! 멋진 후기 감사해요! 추가 앨범이 지급되었어요."
        : "🎁 Wow! Thanks for the great review! An additional album has been provided to you."),
      // 해결: 중복 속성이었던 daily_limit_info 행을 단 하나만 남기고 청소했습니다 (TS1117 제거).
      daily_limit_info: "",
    };
  },
);

// ---------------- resetDailyAlbumLimit (easter egg) ----------------

export const resetDailyAlbumLimit = onCall(
  {
    enforceAppCheck: true,
    secrets: [EASTER_EGG_ANSWER],
    cors: true,
    invoker: "public",
  },
  async (req) => {
    const t0 = Date.now();
    const { answer } = (req.data ?? {}) as { answer?: unknown };

    if (typeof answer !== "string" || answer.length === 0 || answer.length > 200) {
      throw new HttpsError("invalid-argument", "invalid_answer");
    }

    const key = rateLimitKey(req);
    const today = validateClientDate(req.data?.clientDate);

    // Rate limit: max 3 wrong attempts per 60s window per key.
    const attemptsRef = db.collection("easter_egg_attempts").doc(key);
    const now = Date.now();
    const WINDOW_MS = 60_000;
    const MAX_FAILS = 3;

    const locked = await db.runTransaction(async (tx) => {
      const snap = await tx.get(attemptsRef);
      const data = snap.data() as { windowStart?: number; failCount?: number } | undefined;
      const withinWindow = data?.windowStart && now - data.windowStart < WINDOW_MS;
      if (withinWindow && (data?.failCount ?? 0) >= MAX_FAILS) return true;
      return false;
    });
    if (locked) {
      console.log(`[easter] locked key=${key}`);
      throw new HttpsError("permission-denied", "invalid_answer");
    }

    // Timing-safe comparison via SHA-256 (equal-length buffers, hides input length).
    const provided = answer.trim().toLowerCase();
    const expected = EASTER_EGG_ANSWER.value().trim().toLowerCase();
    const providedHash = createHash("sha256").update(provided).digest();
    const expectedHash = createHash("sha256").update(expected).digest();
    const ok = providedHash.length === expectedHash.length && timingSafeEqual(providedHash, expectedHash);

    if (!ok) {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(attemptsRef);
        const data = snap.data() as { windowStart?: number; failCount?: number } | undefined;
        const withinWindow = data?.windowStart && now - data.windowStart < WINDOW_MS;
        if (withinWindow) {
          tx.update(attemptsRef, {
            failCount: FieldValue.increment(1),
            updatedAt: FieldValue.serverTimestamp(),
          });
        } else {
          tx.set(attemptsRef, {
            windowStart: now,
            failCount: 1,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      });
      console.log(`[easter] fail key=${key} elapsedMs=${Date.now() - t0}`);
      throw new HttpsError("permission-denied", "invalid_answer");
    }

    // Success — reset daily limit and clear attempts.
    await db.collection("daily_limits").doc(key).set({
      lastDate: today,
      count: 0,
      bonusGranted: false,
      updatedAt: FieldValue.serverTimestamp(),
    });
    try {
      await attemptsRef.delete();
    } catch {
      // best effort
    }
    console.log(`[easter] ok key=${key} elapsedMs=${Date.now() - t0}`);
    return { success: true };
  },
);

export { searchPlaces, reverseGeocode, geocodeLocation } from "./places";

