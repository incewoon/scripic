// src/lib/gemini.ts
import { ensureFirebaseUser } from "@/integrations/firebase/auth";

const GEMINI_PROXY_URL =
  "https://nlkqzjgsfyiuqjwejlss.supabase.co/functions/v1/gemini-proxy";

export async function callGeminiProxy(
  messages: any[],
  systemInstruction?: string,
): Promise<string> {
  const user = await ensureFirebaseUser();
  const idToken = await user.getIdToken();

  const response = await fetch(GEMINI_PROXY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ messages, systemInstruction }),
  });

  if (!response.ok) {
    let errMsg = `gemini-proxy error ${response.status}`;
    try {
      const errData = await response.json();
      if (errData?.error) errMsg = errData.error;
    } catch {}
    const err: any = new Error(errMsg);
    err.status = response.status;
    throw err;
  }

  const data = await response.json();
  if (data.error) throw new Error(data.error);
  return data.result;
}
