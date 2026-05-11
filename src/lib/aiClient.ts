// Single entry point for AI calls.
//
// Routing:
//   - If Firebase web env is configured → call Firebase Cloud Functions (prod path).
//   - Otherwise → fall back to Supabase Edge Functions that proxy the
//     Lovable AI Gateway (Gemini 2.5 Flash-Lite). This keeps the web preview
//     fully testable before the Android/Firebase setup is done.
//
// Either way, the Gemini API key never reaches the client.

import { httpsCallable } from "firebase/functions";
import { getFns, isFirebaseReady } from "@/integrations/firebase/client";
import { canCreateAlbumToday, getDeviceId } from "./dailyLimit";

const SUPABASE_URL = (import.meta as any).env?.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_KEY = (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

function withDevice<T extends object>(payload: T): T & { deviceId: string } {
  return { ...payload, deviceId: getDeviceId() };
}

// ---------------- chat (streaming) ----------------

export async function* aiChatStream(payload: {
  messages: any[];
  photos?: string[];
  photoCount: number;
  lang: string;
  mode: string;
  maxTurnsPerPhoto?: number;
}): AsyncGenerator<string> {
  if (isFirebaseReady()) {
    yield* firebaseChatStream(payload);
    return;
  }
  yield* supabaseChatStream(payload);
}

async function* firebaseChatStream(payload: any): AsyncGenerator<string> {
  const fn = httpsCallable(getFns(), "chat");
  const res = (fn as any).stream ? await (fn as any).stream(withDevice(payload)) : null;
  if (res?.stream) {
    for await (const chunk of res.stream as AsyncIterable<any>) {
      if (chunk?.delta) yield String(chunk.delta);
    }
    await res.data;
    return;
  }
  const r = await fn(withDevice(payload));
  const text = (r.data as any)?.text ?? "";
  if (text) yield text;
}

async function* supabaseChatStream(payload: any): AsyncGenerator<string> {
  if (!SUPABASE_URL) throw new Error("supabase_not_configured");
  const url = `${SUPABASE_URL}/functions/v1/chat-fallback`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(SUPABASE_KEY ? { Authorization: `Bearer ${SUPABASE_KEY}`, apikey: SUPABASE_KEY } : {}),
    },
    body: JSON.stringify(payload),
  });
  if (!resp.ok || !resp.body) {
    const text = await resp.text().catch(() => "");
    const err: any = new Error(text || `chat fallback ${resp.status}`);
    if (resp.status === 429) err.code = "functions/resource-exhausted";
    if (resp.status === 402) err.code = "functions/resource-exhausted";
    throw err;
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) !== -1) {
      let line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (!line.startsWith("data:")) continue;
      const json = line.slice(5).trim();
      if (!json || json === "[DONE]") continue;
      try {
        const obj = JSON.parse(json);
        const content = obj?.choices?.[0]?.delta?.content;
        if (content) yield String(content);
      } catch {
        buf = line + "\n" + buf;
        break;
      }
    }
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
  if (isFirebaseReady()) {
    const fn = httpsCallable(getFns(), "generateAlbum");
    const r = await fn(withDevice(payload));
    return r.data;
  }
  // Supabase fallback. Enforce daily limit client-side (Firestore handles it on prod).
  if (!canCreateAlbumToday()) {
    const err: any = new Error("daily_limit");
    err.code = "functions/resource-exhausted";
    throw err;
  }
  if (!SUPABASE_URL) throw new Error("supabase_not_configured");
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/album-fallback`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(SUPABASE_KEY ? { Authorization: `Bearer ${SUPABASE_KEY}`, apikey: SUPABASE_KEY } : {}),
    },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    const err: any = new Error(`album fallback ${resp.status}`);
    if (resp.status === 429 || resp.status === 402) err.code = "functions/resource-exhausted";
    throw err;
  }
  return resp.json();
}

// ---------------- dailyStatus ----------------

export async function aiDailyStatus(): Promise<{ used: number; limit: number; today: string }> {
  if (isFirebaseReady()) {
    const fn = httpsCallable(getFns(), "dailyStatus");
    const r = await fn(withDevice({}));
    return r.data as any;
  }
  // Local fallback based on dailyLimit.ts.
  const used = canCreateAlbumToday() ? 0 : 1;
  const today = new Date().toISOString().slice(0, 10);
  return { used, limit: 1, today };
}
