// src/lib/gemini.ts
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { getFirebase } from "@/integrations/firebase/client";

const GEMINI_PROXY_URL = "https://nlkqzjgsfyiuqjwejlss.supabase.co/functions/v1/gemini-proxy";

/**
 * Wait until Firebase has resolved the initial auth state (persisted
 * session restored, or confirmed signed-out). Avoids racing currentUser
 * before the SDK is ready.
 */
function waitForAuthReady() {
  const auth = getAuth(getFirebase());
  // `authStateReady` exists on Firebase JS SDK v10+.
  const anyAuth = auth as any;
  if (typeof anyAuth.authStateReady === "function") {
    return anyAuth.authStateReady() as Promise<void>;
  }
  return new Promise<void>((resolve) => {
    const unsub = onAuthStateChanged(auth, () => {
      unsub();
      resolve();
    });
  });
}

export async function callGeminiProxy(messages: any[], systemInstruction?: string): Promise<string> {
  await waitForAuthReady();
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
