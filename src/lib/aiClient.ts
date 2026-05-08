// Single entry-point for all AI-related network calls.
// Today: Supabase Edge Functions (chat / generate-album).
// Tomorrow: Firebase Functions proxy fronting Gemini directly.
//
// To switch later, set VITE_AI_PROXY_URL in the env. When set, every call
// goes to `${VITE_AI_PROXY_URL}/<path>` instead of the Supabase function.
// The Bearer token also switches to the per-device id so the proxy can do
// rate-limiting / quota counting without user accounts.

import { getDeviceId } from "./dailyLimit";

type AiPath = "chat" | "generate-album";

const PROXY_URL: string | undefined = (import.meta.env as any).VITE_AI_PROXY_URL;
const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY: string = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

function endpoint(path: AiPath): string {
  if (PROXY_URL) return `${PROXY_URL.replace(/\/$/, "")}/${path}`;
  return `${SUPABASE_URL}/functions/v1/${path}`;
}

function authHeader(): string {
  if (PROXY_URL) return `Bearer ${getDeviceId()}`;
  return `Bearer ${SUPABASE_KEY}`;
}

export function aiFetch(path: AiPath, body: unknown): Promise<Response> {
  return fetch(endpoint(path), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader(),
      "X-Device-Id": getDeviceId(),
    },
    body: JSON.stringify(body),
  });
}
