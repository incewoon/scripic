// Cloud Functions for Firebase — proxy for Gemini 2.5 Flash-Lite.
//
// All AI traffic from the app goes through these callable functions:
//   - chat            : streaming interview turns
//   - generateAlbum   : structured album JSON (title/intro/captions/closing/...)
//
// Security:
//   - App Check is ENFORCED (Play Integrity in production, debug token in dev).
//   - Daily 1-album limit is counted in Firestore, keyed by App Check appId
//     (falls back to a client-supplied deviceId if App Check is missing).
//   - The Gemini API key lives ONLY on the server (functions secret).

import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { setGlobalOptions } from "firebase-functions/v2";

import { geminiGenerate, geminiStreamText, toGeminiRequest, GeminiRateLimitError, type OpenAIMessage } from "./gemini";
import { chatSystemPrompt, turnLimitClause, type Mode } from "./prompts-chat";
import { albumSystem, albumUserPrompt, toneInstruction, type Mode as AlbumMode, type Tone } from "./prompts-album";

initializeApp();
const db = getFirestore();

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

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
  if (deviceId) return `dev:${deviceId}`;
  const appId = req.app?.appId;
  if (appId) return `app:${appId}`;
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
  // @ts-ignore - streaming response 지원을 위한 임시 타입 무시
  async (request: any, response: any) => {
    const {
      messages,
      photos,
      photoCount: pcFromClient,
      lang = "en",
      mode = "creative",
      maxTurnsPerPhoto: rawCap,
    } = (request.data ?? {}) as {
      messages: OpenAIMessage[];
      photos?: string[];
      photoCount?: number;
      lang?: string;
      mode?: Mode;
      maxTurnsPerPhoto?: number;
    };

    if (!Array.isArray(messages) || messages.length === 0) {
      throw new HttpsError("invalid-argument", "messages required");
    }

    const m: Mode = mode === "fact" || mode === "brief" ? mode : "creative";
    const maxTurnsPerPhoto = typeof rawCap === "number" && rawCap > 0 ? Math.min(20, Math.floor(rawCap)) : 3;
    const photoCount = typeof pcFromClient === "number" && pcFromClient > 0 ? pcFromClient : (photos?.length ?? 0);

    // Inject photos into the first user message on the opening turn.
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

    let full = "";
    try {
      for await (const delta of geminiStreamText(body)) {
        full += delta;
        if (response?.sendChunk) response.sendChunk({ delta });
      }
    } catch (e: any) {
      if (e instanceof GeminiRateLimitError) {
        throw new HttpsError("resource-exhausted", "ai_quota_exhausted", { kind: "ai_quota", status: e.status });
      }
      throw new HttpsError("internal", e?.message ?? "gemini stream failed");
    }
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
    const {
      messages,
      photoCount,
      lang = "en",
      period,
      location,
      mode = "creative",
      tone = "politely",
    } = (req.data ?? {}) as {
      messages: { role: string; content: any }[];
      photoCount: number;
      lang?: string;
      period?: string;
      location?: string;
      mode?: AlbumMode;
      tone?: Tone;
    };

    if (!Array.isArray(messages) || messages.length === 0) {
      throw new HttpsError("invalid-argument", "messages required");
    }
    if (!photoCount || photoCount < 1) throw new HttpsError("invalid-argument", "photoCount required");

    const m: AlbumMode = mode === "fact" || mode === "brief" ? mode : "creative";
    const tn: Tone = tone === "friendly" || tone === "short" ? tone : "politely";

    // Enforce 1 album / day BEFORE we burn a Gemini call.
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
        return `${msg.role === "user" ? "User" : "AI"}: ${t}`;
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
      result = await geminiGenerate(body);
    } catch (e: any) {
      await rollbackDailyCount();
      if (e instanceof GeminiRateLimitError) {
        throw new HttpsError("resource-exhausted", "ai_quota_exhausted", { kind: "ai_quota", status: e.status });
      }
      throw new HttpsError("internal", e?.message ?? "gemini failed");
    }
    const parts = result?.candidates?.[0]?.content?.parts ?? [];
    const fc = parts.find((p: any) => p.functionCall)?.functionCall;
    if (!fc?.args) {
      await rollbackDailyCount();
      throw new HttpsError("internal", "gemini did not return album");
    }
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
  return { used, limit: 1, today };
});

// ---------------- grantReviewReward ----------------
//
// Verifies a screenshot of a social-media review of the app via Gemini Vision,
// and on approval marks today's daily-limit doc with `bonusGranted: true`,
// raising the per-device cap from 1 → 2 albums for the rest of the day.

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
2) The image visibly contains at least one of: "Scripic", "스크립픽", or "ince.lovable.app"
   (in text, caption, URL, app header, or screenshot embedded in the post).

REJECT (approved=false) when:
- Only old brand "Memory Weaver" / "메모리위버" is visible, with no current brand mark.
- Only generic phrases like "AI 앨범" appear without Scripic / 스크립픽 / ince.lovable.app.
- The image is unrelated (food, pet, meme, blank, random screenshot).
- It is just an app screenshot with no review/post wrapper.

Output STRICT JSON only — no markdown fences, no commentary:
{
  "approved": true | false,
  "detected_brand": "scripic" | "memory_weaver" | "generic" | "none",
  "reason": "one short sentence (Korean) explaining your decision",
  "success_message": "Korean celebration message if approved, otherwise empty string"
}

If rejecting because only "Memory Weaver / 메모리위버" is visible, set reason to
"이 앱의 현재 브랜드(Scripic / 스크립픽)가 보이지 않아요. 현재 브랜드명이 보이는 후기 스크린샷을 올려주세요."

Pick a success_message similar to:
- "🎉 와우! 멋진 후기 감사해요! 추가 앨범이 지급되었어요."
- "❤️ 후기 공유 정말 감사합니다! 추가 앨범이 지급되었어요!"
- "🌟 최고의 리뷰예요! 오늘 하나 더 만들 수 있게 됐어요."
- "🎁 후기 업로드 확인 완료! 추가 앨범 생성권이 지급되었습니다."`;

export const grantReviewReward = onCall(
  {
    enforceAppCheck: true,
    secrets: [GEMINI_API_KEY],
  },
  async (req) => {
    const { imageDataUrl } = (req.data ?? {}) as { imageDataUrl?: string };
    if (!imageDataUrl || typeof imageDataUrl !== "string" || !imageDataUrl.startsWith("data:")) {
      throw new HttpsError("invalid-argument", "imageDataUrl required");
    }
    if (imageDataUrl.length > 1_500_000) {
      throw new HttpsError("invalid-argument", "image too large");
    }

    const key = rateLimitKey(req);
    const today = validateClientDate(req.data?.localDate);

    // Short-circuit: bonus already granted today.
    const existing = await db.collection("daily_limits").doc(key).get();
    const exData = existing.data();
    if (exData?.lastDate === today && exData?.bonusGranted === true) {
      return {
        approved: false,
        reason: "already_granted",
        success_message: "",
        daily_limit_info: "오늘 이미 추가 앨범을 사용하셨습니다. (자정에 초기화됩니다)",
      };
    }

    // Verify the screenshot with Gemini Vision.
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
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
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
      if (e instanceof GeminiRateLimitError) {
        throw new HttpsError("resource-exhausted", "ai_quota_exhausted", { kind: "ai_quota", status: e.status });
      }
      return {
        approved: false,
        reason: "AI 응답을 해석하지 못했어요. 다른 스크린샷으로 다시 시도해주세요.",
        success_message: "",
        daily_limit_info: "",
      };
    }

    // Server-side brand guard: even if the model approved, the response must
    // claim the current brand. Reject old "Memory Weaver" / generic-only cases.
    const detected = String(parsed.detected_brand ?? "").toLowerCase();
    const isCurrentBrand = detected === "scripic";
    const isOldOrGeneric = detected === "memory_weaver" || detected === "generic" || detected === "none";

    if (parsed.approved && !isCurrentBrand) {
      console.log("[reviewReward] override-reject: model approved but detected_brand=", detected);
      return {
        approved: false,
        reason:
          isOldOrGeneric || !detected
            ? "이 앱의 현재 브랜드(Scripic / 스크립픽)가 보이지 않아요. 앱이름이 보이는 후기 스크린샷을 올려주세요."
            : "앱이름을 확인하지 못했어요. 다른 스크린샷으로 다시 시도해주세요.",
        success_message: "",
        daily_limit_info: "",
      };
    }

    if (!parsed.approved) {
      console.log("[reviewReward] rejected by AI:", parsed.reason, "detected:", detected);
      return {
        approved: false,
        reason: parsed.reason ?? "후기 내용을 인식하지 못했어요. 'Scripic'이 보이게 캡처해 주세요.",
        success_message: "",
        daily_limit_info: "",
      };
    }

    await grantDailyBonus(key, today);

    return {
      approved: true,
      reason: parsed.reason ?? "ok",
      success_message: parsed.success_message ?? "🎁 후기 업로드 확인 완료! 추가 앨범 생성권이 지급되었습니다.",
      daily_limit_info: "",
    };
  },
);
