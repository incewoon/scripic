// src/lib/gemini.ts
import { getAuth } from "firebase/auth";
import { getFirebase } from "@/integrations/firebase/client";

const GEMINI_PROXY_URL =
  "https://nlkqzjgsfyiuqjwejlss.supabase.co/functions/v1/gemini-proxy";

export async function callGeminiProxy(
  messages: any[],
  systemInstruction?: string,
): Promise<string> {
  const auth = getAuth(getFirebase());
  const user = auth.currentUser;
  if (!user) {
    throw new Error("로그인이 필요합니다.");
  }

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
    } catch {
      // ignore
    }
    const err: any = new Error(errMsg);
    err.status = response.status;
    throw err;
  }

  const data = await response.json();
  if (data.error) throw new Error(data.error);

  return data.result;
}
