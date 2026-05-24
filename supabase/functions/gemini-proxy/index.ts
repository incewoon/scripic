// Supabase Edge Function: gemini-proxy
import { create, getNumericDate } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

// --- PEM → CryptoKey ---
function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(pem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

// --- Google Access Token (cached) ---
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<{ token: string; projectId: string }> {
  const raw = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT not configured");
  const sa = JSON.parse(raw);
  const { client_email, private_key, project_id } = sa;

  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt - 60 > now) {
    return { token: cachedToken.token, projectId: project_id };
  }

  const key = await importPrivateKey(private_key);
  const jwt = await create(
    { alg: "RS256", typ: "JWT" },
    {
      iss: client_email,
      scope: "https://www.googleapis.com/auth/datastore",
      aud: "https://oauth2.googleapis.com/token",
      exp: getNumericDate(3600),
      iat: getNumericDate(0),
    },
    key,
  );

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!res.ok) throw new Error(`OAuth2 token error: ${res.status}`);
  const data = await res.json();

  cachedToken = {
    token: data.access_token,
    expiresAt: now + (data.expires_in ?? 3600),
  };

  return { token: cachedToken.token, projectId: project_id };
}

// --- Firebase ID Token 검증 ---
async function verifyIdToken(idToken: string): Promise<string> {
  const apiKey = Deno.env.get("FIREBASE_WEB_API_KEY");
  if (!apiKey) throw new Error("FIREBASE_WEB_API_KEY not configured");

  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });

  if (!res.ok) throw new Error("invalid_id_token");
  const data = await res.json();
  const uid = data?.users?.[0]?.localId;
  if (!uid) throw new Error("invalid_id_token");
  return uid;
}

// --- Firestore: 일일 제한 확인 ---
async function checkDailyLimit(projectId: string, accessToken: string, uid: string): Promise<{ allowed: boolean }> {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${uid}/flags/daily`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });

  if (res.status === 404) return { allowed: true };
  if (!res.ok) throw new Error(`Firestore GET error ${res.status}`);

  const data = await res.json();
  const last = data?.fields?.lastUsedDate?.stringValue;
  return { allowed: last !== todayUTC() };
}

// --- Firestore: 플래그 업데이트 ---
async function updateDailyFlag(projectId: string, accessToken: string, uid: string): Promise<void> {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${uid}/flags/daily?updateMask.fieldPaths=lastUsedDate&updateMask.fieldPaths=metadata`;
  const body = {
    fields: {
      lastUsedDate: { stringValue: todayUTC() },
      metadata: { mapValue: { fields: {} } },
    },
  };

  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`Firestore PATCH error ${res.status}`);
}

// --- Gemini 호출 ---
async function callGemini(messages: any[], systemInstruction?: string): Promise<string> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

  const body: any = { contents: messages };
  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`Gemini API error ${res.status}`);
  const data = await res.json();

  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  return parts.map((p: any) => p?.text ?? "").join("\n");
}

// --- 메인 핸들러 ---
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  try {
    const auth = req.headers.get("Authorization") ?? req.headers.get("authorization");
    if (!auth?.startsWith("Bearer ")) {
      return json({ error: "missing_bearer_token" }, 401);
    }

    const idToken = auth.slice(7).trim();
    const uid = await verifyIdToken(idToken);

    const { token: accessToken, projectId } = await getAccessToken();
    const { allowed } = await checkDailyLimit(projectId, accessToken, uid);

    if (!allowed) {
      return json({ error: "daily_limit_exceeded" }, 429);
    }

    const payload = await req.json().catch(() => null);
    if (!payload?.messages || !Array.isArray(payload.messages)) {
      return json({ error: "invalid_body" }, 400);
    }

    const result = await callGemini(payload.messages, payload.systemInstruction);
    await updateDailyFlag(projectId, accessToken, uid);

    return json({ result }, 200);
  } catch (e) {
    console.error("[gemini-proxy] error:", e);
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg.includes("invalid_id_token") ? 401 : 500;
    return json({ error: msg }, status);
  }
});
