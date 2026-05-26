import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const SYSTEM_PROMPT = `You are the Reward System Agent for the Scripic app
(Scripic - the app that turns every photo into a meaningful, unforgettable memory album).
Your ONLY job is to manage the entire "Share Your Review → Get +1 Extra Album Today" feature.

FLOW (follow exactly in this order):

1. Daily Limit Check
   - The app will provide current user status in the input as: { "daily_extra_used_today": true or false }
   - If daily_extra_used_today == true, immediately reject and do not analyze the image.
   - If daily_extra_used_today == false, proceed to image analysis.

2. Image Analysis (only if daily limit allows)
   - The user uploaded ONE image that they claim is a screenshot of their review/post about Scripic
     on social media.
   - Accepted platforms:
     Instagram, Facebook, Threads, X (Twitter), TikTok, YouTube Community,
     KakaoStory, Naver Blog, Naver Cafe, Band, or any other social media platform.
   - For Korean platforms (KakaoStory, Naver Blog, Naver Cafe, Band, etc.), look for:
     profile icons, 공감/좋아요 buttons, 댓글 section, post timestamp, username area.
   - Check if the image is a screenshot of a social media post
     (look for username, profile picture, like/comment/share buttons, caption area, etc.).
   - Check if the post is about Scripic. Look for any of the following (case insensitive):
     · Scripic / Scripic app
     · photo album / photo story / memory album / meaningful album / ai album / script pic / script album
     · "사진 한 장 한 장에 이야기를" or any description about turning photos into scripts/stories/albums
     · Positive words like "추천", "최고", "추억", "감동", "강추", "love", "amazing", "recommend", "best", etc.
       in context of the app
   - Be generous but smart:
     · Even a short post mentioning the app name or clearly showing the user sharing
       their Scripic album is enough.
     · Pure spam (random photo, food, cat, meme, blank image, unrelated screenshot, or screenshot without any text mentioning Scripic or photo album) must be rejected with approved = false.
   - DO NOT judge if the review is "real" or "fake". Only check visual and textual relevance to Scripic.

3. Decision & Output
   - If daily limit already used → approved = false, reason = "You have already used your extra album for today."
   - If image not relevant → approved = false
   - If everything OK → approved = true and grant +1 extra album today.

Output format MUST be valid JSON only:
{
  "approved": true or false,
  "reason": "one short sentence explaining your decision",
  "confidence": "If approved is true, confidence must be 70 or higher; if false, it must be 50 or lower.",
  "success_message": "The exact Korean message to show the user (only when approved=true, otherwise empty string)",
  "daily_limit_info": "오늘 이미 추가 앨범을 사용하셨습니다. (자정에 초기화됩니다)"
}

Success Messages (choose one or a similar natural variation):
- "🎉 와우! 멋진 후기 감사해요! 추가 앨범이 지급되었어요. 이제 추가로 앨범을 만들 수 있어요!"
- "❤️ 후기 공유 정말 감사합니다! Scripic을 더 많은 분들께 알려지게 해주셔서 고마워요. 추가 앨범이 지급되었어요!"
- "🌟 최고의 리뷰예요! 덕분에 오늘 하나 더 만들 수 있게 됐어요. Scripic과 함께 더 많은 추억을 만들어 보세요!"
- "🎁 후기 업로드 확인 완료! 추가 앨범 생성권이 지급되었습니다. 지금 바로 새로운 앨범을 만들어 보세요!"

If approved=true, always pick ONE of the above success_messages (or a very similar natural variation)
and put it in success_message.
daily_limit_info should be empty string unless daily_extra_used_today was true.
Never output anything except the JSON.`;

function fail(reason: string, error: string, extra?: Partial<Record<string, unknown>>) {
  return {
    approved: false,
    reason,
    confidence: 0,
    success_message: "",
    daily_limit_info: "",
    error,
    ...extra,
  };
}

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

// --- Firebase ID token verification (Identity Toolkit lookup) ---
async function verifyFirebaseIdToken(idToken: string): Promise<string> {
  const apiKey = process.env.FIREBASE_WEB_API_KEY;
  if (!apiKey) throw new Error("FIREBASE_WEB_API_KEY not configured");
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    },
  );
  if (!res.ok) throw new Error("invalid_id_token");
  const data: any = await res.json();
  const uid = data?.users?.[0]?.localId;
  if (!uid) throw new Error("invalid_id_token");
  return uid;
}

// --- Google OAuth2 access token via service account (cached) ---
let cachedAccessToken: { token: string; projectId: string; expiresAt: number } | null = null;

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

function b64url(input: ArrayBuffer | string): string {
  let bin: string;
  if (typeof input === "string") {
    bin = input;
  } else {
    const bytes = new Uint8Array(input);
    let s = "";
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    bin = s;
  }
  return btoa(bin).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function getGoogleAccessToken(): Promise<{ token: string; projectId: string }> {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT not configured");
  const sa = JSON.parse(raw);
  const { client_email, private_key, project_id } = sa as {
    client_email: string;
    private_key: string;
    project_id: string;
  };

  const now = Math.floor(Date.now() / 1000);
  if (cachedAccessToken && cachedAccessToken.expiresAt - 60 > now) {
    return { token: cachedAccessToken.token, projectId: cachedAccessToken.projectId };
  }

  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: client_email,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput),
  );
  const jwt = `${signingInput}.${b64url(sig)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) throw new Error(`oauth_token_error_${res.status}`);
  const data: any = await res.json();
  cachedAccessToken = {
    token: data.access_token,
    projectId: project_id,
    expiresAt: now + (data.expires_in ?? 3600),
  };
  return { token: cachedAccessToken.token, projectId: project_id };
}

// --- Firestore: server-side daily extra-album tracking ---
const FS_DOC_PATH = (projectId: string, uid: string) =>
  `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${uid}/flags/review_extra`;

async function getReviewExtraUsedToday(
  projectId: string,
  accessToken: string,
  uid: string,
): Promise<boolean> {
  const res = await fetch(FS_DOC_PATH(projectId, uid), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 404) return false;
  if (!res.ok) throw new Error(`firestore_get_${res.status}`);
  const data: any = await res.json();
  const last = data?.fields?.lastGrantedDate?.stringValue;
  return last === todayUTC();
}

async function setReviewExtraUsedToday(
  projectId: string,
  accessToken: string,
  uid: string,
): Promise<void> {
  const url = `${FS_DOC_PATH(projectId, uid)}?updateMask.fieldPaths=lastGrantedDate`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fields: { lastGrantedDate: { stringValue: todayUTC() } },
    }),
  });
  if (!res.ok) throw new Error(`firestore_patch_${res.status}`);
}

export const verifyReviewScreenshot = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        idToken: z.string().min(20).max(8192),
        imageDataUrl: z.string().min(20).max(8_000_000),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return fail("Server not configured.", "missing_api_key");

    // 1) Authenticate caller via Firebase ID token
    let uid: string;
    try {
      uid = await verifyFirebaseIdToken(data.idToken);
    } catch {
      return fail("Not authenticated.", "unauthenticated");
    }

    // 2) Server-side daily limit check (Firestore) — do not trust the client
    let accessToken: string;
    let projectId: string;
    try {
      ({ token: accessToken, projectId } = await getGoogleAccessToken());
    } catch (e) {
      console.error("review reward oauth error", e);
      return fail("Server not configured.", "oauth_error");
    }

    let alreadyUsed = false;
    try {
      alreadyUsed = await getReviewExtraUsedToday(projectId, accessToken, uid);
    } catch (e) {
      console.error("review reward firestore get error", e);
      return fail("Server error.", "firestore_get");
    }

    if (alreadyUsed) {
      return {
        approved: false,
        reason: "You have already used your extra album for today.",
        confidence: 0,
        success_message: "",
        daily_limit_info: "오늘 이미 추가 앨범을 사용하셨습니다. (자정에 초기화됩니다)",
      };
    }

    // 3) Call the AI gateway
    const userPayload = JSON.stringify({ daily_extra_used_today: false });
    let resp: Response;
    try {
      resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content: [
                { type: "text", text: `Input: ${userPayload}\n\nHere is the user's screenshot:` },
                { type: "image_url", image_url: { url: data.imageDataUrl } },
              ],
            },
          ],
          response_format: { type: "json_object" },
        }),
      });
    } catch (e) {
      console.error("review reward fetch failed", e);
      return fail("Network error.", "network");
    }

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      console.error("review reward gateway error", resp.status, text);
      const err =
        resp.status === 429
          ? "rate_limited"
          : resp.status === 402
            ? "payment_required"
            : "gateway_error";
      return fail(
        resp.status === 429
          ? "Too many requests. Please try again in a moment."
          : resp.status === 402
            ? "AI usage limit reached."
            : "AI verification failed.",
        err,
      );
    }

    const json = (await resp.json().catch(() => null)) as any;
    const content: string | undefined = json?.choices?.[0]?.message?.content;
    if (!content) return fail("Empty AI response.", "empty_response");

    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      const m = content.match(/\{[\s\S]*\}/);
      if (m) {
        try {
          parsed = JSON.parse(m[0]);
        } catch {}
      }
    }
    if (!parsed || typeof parsed.approved !== "boolean") {
      return fail("Unexpected AI response.", "parse_error");
    }

    // 4) If approved, record server-side daily usage
    if (parsed.approved) {
      try {
        await setReviewExtraUsedToday(projectId, accessToken, uid);
      } catch (e) {
        console.error("review reward firestore patch error", e);
        return fail("Server error.", "firestore_patch");
      }
    }

    return {
      approved: !!parsed.approved,
      reason: typeof parsed.reason === "string" ? parsed.reason : "",
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
      success_message:
        typeof parsed.success_message === "string" ? parsed.success_message : "",
      daily_limit_info:
        typeof parsed.daily_limit_info === "string" ? parsed.daily_limit_info : "",
    };
  });
