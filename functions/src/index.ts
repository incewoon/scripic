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

import {
  geminiGenerate,
  geminiStreamText,
  toGeminiRequest,
  type OpenAIMessage,
} from "./gemini";
import { chatSystemPrompt, turnLimitClause, type Mode } from "./prompts-chat";
import {
  albumSystem,
  albumUserPrompt,
  toneInstruction,
  type Mode as AlbumMode,
  type Tone,
} from "./prompts-album";

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

function todayKey(d = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Stable identifier for rate-limiting. Prefer App Check appId. */
function rateLimitKey(req: { app?: { appId?: string }; data?: any }): string {
  const appId = req.app?.appId;
  if (appId) return `app:${appId}`;
  const deviceId = String(req.data?.deviceId ?? "").slice(0, 128);
  if (deviceId) return `dev:${deviceId}`;
  throw new HttpsError("failed-precondition", "missing app check token and device id");
}

/**
 * Reserve today's album slot atomically. Throws if already used today.
 * Pass commit=false to only PEEK (used by /chat which shouldn't burn a slot).
 */
async function reserveDailyAlbum(key: string, commit: boolean): Promise<void> {
  const docRef = db.collection("daily_limits").doc(key);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(docRef);
    const data = snap.data();
    const today = todayKey();
    if (data?.lastDate === today && (data?.count ?? 0) >= 1) {
      throw new HttpsError("resource-exhausted", "daily album limit reached");
    }
    if (!commit) return;
    if (data?.lastDate === today) {
      tx.update(docRef, { count: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() });
    } else {
      tx.set(docRef, { lastDate: today, count: 1, updatedAt: FieldValue.serverTimestamp() });
    }
  });
}

// ---------------- chat (streaming) ----------------

export const chat = onCall(
  {
    enforceAppCheck: true,
    secrets: [GEMINI_API_KEY],
  },
  async (req, response) => {
    const { messages, photos, photoCount: pcFromClient, lang = "en", mode = "creative", maxTurnsPerPhoto: rawCap } =
      (req.data ?? {}) as {
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
    const maxTurnsPerPhoto =
      typeof rawCap === "number" && rawCap > 0 ? Math.min(20, Math.floor(rawCap)) : 3;
    const photoCount =
      typeof pcFromClient === "number" && pcFromClient > 0 ? pcFromClient : photos?.length ?? 0;

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

    const system =
      chatSystemPrompt(lang, photoCount, m) + turnLimitClause(lang, photoCount, maxTurnsPerPhoto);

    const body = toGeminiRequest([{ role: "system", content: system }, ...enriched]);

    let full = "";
    try {
      for await (const delta of geminiStreamText(body)) {
        full += delta;
        if (response?.sendChunk) response.sendChunk({ delta });
      }
    } catch (e: any) {
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
    const { messages, photoCount, lang = "en", period, location, mode = "creative", tone = "politely" } =
      (req.data ?? {}) as {
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
    await reserveDailyAlbum(key, true);

    const transcript = messages
      .map((msg) => {
        const t =
          typeof msg.content === "string"
            ? msg.content
            : Array.isArray(msg.content)
            ? msg.content.find?.((c: any) => c.type === "text")?.text ?? "(photos)"
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

    const result = await geminiGenerate(body);
    const parts = result?.candidates?.[0]?.content?.parts ?? [];
    const fc = parts.find((p: any) => p.functionCall)?.functionCall;
    if (!fc?.args) {
      // rollback the daily counter so the user can retry today
      await db
        .collection("daily_limits")
        .doc(key)
        .set({ lastDate: todayKey(), count: 0, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      throw new HttpsError("internal", "gemini did not return album");
    }
    return fc.args;
  },
);

// ---------------- dailyStatus (peek) ----------------

export const dailyStatus = onCall({ enforceAppCheck: true }, async (req) => {
  const key = rateLimitKey(req);
  const snap = await db.collection("daily_limits").doc(key).get();
  const data = snap.data();
  const today = todayKey();
  const used = data?.lastDate === today ? data?.count ?? 0 : 0;
  return { used, limit: 1, today };
});
