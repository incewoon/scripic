// Single entry point for AI calls.
//
// All AI traffic goes through the Supabase Edge Function `gemini-proxy`,
// which verifies the Firebase ID Token, enforces the daily limit in
// Firestore, and proxies to the Gemini API. The Gemini key never reaches
// the client.

import { callGeminiProxy } from "./gemini";
import { canCreateAlbumToday } from "./dailyLimit";

// ---------------- helpers ----------------

type OAIPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

function dataUrlToInlineData(
  url: string,
): { mimeType: string; data: string } | null {
  const m = /^data:([^;]+);base64,(.+)$/.exec(url);
  if (!m) return null;
  return { mimeType: m[1], data: m[2] };
}

function partsFromOpenAIContent(content: any): any[] {
  if (typeof content === "string") return [{ text: content }];
  if (!Array.isArray(content)) return [{ text: String(content ?? "") }];
  const out: any[] = [];
  for (const p of content as OAIPart[]) {
    if (p.type === "text") out.push({ text: p.text });
    else if (p.type === "image_url") {
      const inline = dataUrlToInlineData(p.image_url.url);
      if (inline) out.push({ inlineData: inline });
    }
  }
  return out;
}

/**
 * Convert OpenAI-style messages to Gemini `contents[]`, extracting any
 * system messages into a single systemInstruction string. If `photos` is
 * provided, attach the first up-to-3 as inlineData parts on the last user
 * turn.
 */
function toGeminiPayload(
  messages: any[],
  photos?: string[],
  extraSystem?: string,
): { contents: any[]; systemInstruction?: string } {
  const systemTexts: string[] = [];
  const contents: any[] = [];

  for (const m of messages ?? []) {
    if (m.role === "system") {
      systemTexts.push(
        typeof m.content === "string" ? m.content : JSON.stringify(m.content),
      );
      continue;
    }
    contents.push({
      role: m.role === "assistant" ? "model" : "user",
      parts: partsFromOpenAIContent(m.content),
    });
  }

  if (photos && photos.length) {
    // Find the last user turn (or create one) and append inlineData parts.
    let lastUserIdx = -1;
    for (let i = contents.length - 1; i >= 0; i--) {
      if (contents[i].role === "user") {
        lastUserIdx = i;
        break;
      }
    }
    if (lastUserIdx === -1) {
      contents.push({ role: "user", parts: [] });
      lastUserIdx = contents.length - 1;
    }
    for (const url of photos.slice(0, 3)) {
      const inline = dataUrlToInlineData(url);
      if (inline) contents[lastUserIdx].parts.push({ inlineData: inline });
    }
  }

  if (extraSystem) systemTexts.push(extraSystem);
  const systemInstruction = systemTexts.filter(Boolean).join("\n\n") || undefined;
  return { contents, systemInstruction };
}

function mapProxyError(e: any): never {
  const msg = e?.message ?? String(e);
  const err: any = new Error(msg);
  if (e?.status === 429 || msg === "daily_limit_exceeded") {
    err.code = "functions/resource-exhausted";
  } else if (e?.status === 401) {
    err.code = "functions/unauthenticated";
  }
  throw err;
}

// ---------------- chat (non-streaming, yielded as single chunk) ----------------

export async function* aiChatStream(payload: {
  messages: any[];
  photos?: string[];
  photoCount: number;
  lang: string;
  mode: string;
  maxTurnsPerPhoto?: number;
}): AsyncGenerator<string> {
  const { contents, systemInstruction } = toGeminiPayload(
    payload.messages,
    payload.photos,
  );
  try {
    const text = await callGeminiProxy(contents, systemInstruction);
    if (text) yield text;
  } catch (e) {
    mapProxyError(e);
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
  const { contents, systemInstruction } = toGeminiPayload(payload.messages);
  try {
    const text = await callGeminiProxy(contents, systemInstruction);
    // Album prompts ask for JSON; try to parse, fall back to raw text.
    try {
      const cleaned = text
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "");
      return JSON.parse(cleaned);
    } catch {
      return { text };
    }
  } catch (e) {
    mapProxyError(e);
  }
}

// ---------------- dailyStatus ----------------

export async function aiDailyStatus(): Promise<{
  used: number;
  limit: number;
  today: string;
}> {
  // gemini-proxy enforces the daily limit server-side and does not expose a
  // status endpoint. Use the local mirror so the UI can still show
  // "1 album/day" state.
  const used = canCreateAlbumToday() ? 0 : 1;
  const today = new Date().toISOString().slice(0, 10);
  return { used, limit: 1, today };
}
