// src/lib/gemini.ts
import { getAuth, onAuthStateChanged, type User } from "firebase/auth";
import { getFirebase } from "@/integrations/firebase/client";

const GEMINI_PROXY_URL = "https://nlkqzjgsfyiuqjwejlss.supabase.co/functions/v1/gemini-proxy";

async function getAuthenticatedUser(): Promise<User> {
  const auth = getAuth(getFirebase());

  // 1. 이미 로그인된 상태라면 바로 반환
  if (auth.currentUser) {
    return auth.currentUser;
  }

  // 2. Auth 초기화 대기 (최대 6초)
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error("로그인이 필요합니다."));
    }, 6000);

    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        window.clearTimeout(timeout);
        unsub();
        resolve(user);
      }
    });
  });
}

export async function callGeminiProxy(messages: any[], systemInstruction?: string): Promise<string> {
  try {
    const user = await getAuthenticatedUser();
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
  } catch (error: any) {
    console.error("[callGeminiProxy] Failed:", error);
    throw error;
  }
}
