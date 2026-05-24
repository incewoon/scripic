// src/lib/gemini.ts
import { getAuth } from "firebase/auth";
import { getFirebase } from "@/integrations/firebase/client";

const GEMINI_PROXY_URL = "https://nlkqzjgsfyiuqjwejlss.supabase.co/functions/v1/gemini-proxy";

export async function callGeminiProxy(messages: any[], systemInstruction?: string): Promise<string> {
  const firebaseApp = getFirebase();
  const auth = getAuth(firebaseApp);

  // Auth 상태가 준비될 때까지 기다림 (중요 수정)
  if (!auth.currentUser) {
    // Auth가 초기화될 때까지 약간 대기 (또는 onAuthStateChanged 사용 권장)
    await new Promise((resolve) => setTimeout(resolve, 300));
    if (!auth.currentUser) {
      throw new Error("로그인이 필요합니다.");
    }
  }

  const user = auth.currentUser!;
  const idToken = await user.getIdToken(true); // forceRefresh: true

  const response = await fetch(GEMINI_PROXY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      messages,
      systemInstruction,
    }),
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
