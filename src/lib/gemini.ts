// src/lib/gemini.ts
import { getAuth, onAuthStateChanged, type User } from "firebase/auth";
import { getFirebase } from "@/integrations/firebase/client";

const GEMINI_PROXY_URL = "https://nlkqzjgsfyiuqjwejlss.supabase.co/functions/v1/gemini-proxy";

async function getAuthenticatedUser(): Promise<User> {
  const auth = getAuth(getFirebase());

  console.log("[auth] getFirebase() 성공");

  if (auth.currentUser) {
    console.log("[auth] 이미 로그인된 사용자:", auth.currentUser.uid);
    return auth.currentUser;
  }

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      console.error("[auth] 6초 timeout - 로그인 상태를 확인할 수 없음");
      reject(new Error("로그인이 필요합니다."));
    }, 6000);

    const unsub = onAuthStateChanged(auth, (user) => {
      console.log("[auth] onAuthStateChanged:", user?.uid ?? null);
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
