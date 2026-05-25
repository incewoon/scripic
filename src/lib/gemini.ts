// src/lib/gemini.ts
import { getAuth, onAuthStateChanged, type User } from "firebase/auth";
import { getFirebase } from "@/integrations/firebase/client";

const GEMINI_PROXY_URL = "https://nlkqzjgsfyiuqjwejlss.supabase.co/functions/v1/gemini-proxy";

/**
 * Firebase Auth가 초기 상태를 완전히 로드할 때까지 기다린 후 사용자 반환
 */
async function getAuthenticatedUser(): Promise<User> {
  const auth = getAuth(getFirebase());

  // 이미 로그인된 상태라면 바로 반환
  if (auth.currentUser) {
    return auth.currentUser;
  }

  // Auth 초기화 대기
  return new Promise<User>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error("로그인이 필요합니다."));
    }, 8000); // 8초 타임아웃

    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        window.clearTimeout(timeout);
        unsub();
        resolve(user);
      }
      // user가 null이면 (로그아웃 상태) 계속 기다리지 않음
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
  } catch (error: any) {
    console.error("[callGeminiProxy] Error:", error);
    throw error;
  }
}
