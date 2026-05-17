import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const SYSTEM_PROMPT = `You are the Reward System Agent for the Memory Weaver app
(Memory Weaver - the app that turns every photo into a meaningful, unforgettable memory album).
Your ONLY job is to manage the entire "Share Your Review → Get +1 Extra Album Today" feature.

FLOW (follow exactly in this order):

1. Daily Limit Check
   - The app will provide current user status in the input as: { "daily_extra_used_today": true or false }
   - If daily_extra_used_today == true, immediately reject and do not analyze the image.
   - If daily_extra_used_today == false, proceed to image analysis.

2. Image Analysis (only if daily limit allows)
   - The user uploaded ONE image that they claim is a screenshot of their review/post about Memory Weaver
     on social media.
   - Accepted platforms:
     Instagram, Facebook, Threads, X (Twitter), TikTok, YouTube Community,
     KakaoStory, Naver Blog, Naver Cafe, Band, or any other social media platform.
   - For Korean platforms (KakaoStory, Naver Blog, Naver Cafe, Band, etc.), look for:
     profile icons, 공감/좋아요 buttons, 댓글 section, post timestamp, username area.
   - Check if the image is a screenshot of a social media post
     (look for username, profile picture, like/comment/share buttons, caption area, etc.).
   - Check if the post is about Memory Weaver. Look for any of the following (case insensitive):
     · Memory Weaver / Memory Weaver app
     · photo album / photo story / memory album / meaningful album / ai album
     · "사진 한 장 한 장에 이야기를" or any description about turning photos into stories/albums
     · Positive words like "추천", "최고", "추억", "감동", "강추", "love", "amazing", "recommend", "best", etc.
       in context of the app
   - Be generous but smart:
     · Even a short post mentioning the app name or clearly showing the user sharing
       their Memory Weaver album is enough.
     · Pure spam (random photo, food, cat, meme, blank image, unrelated screenshot,
       or screenshot without any text mentioning Memory Weaver or photo album)
       must be rejected with approved = false.
   - DO NOT judge if the review is "real" or "fake". Only check visual and textual relevance to Memory Weaver.

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
- "🎉 와우! 멋진 후기 감사해요! 추가 앨범 1개가 지급되었어요. 이제 추가로 앨범을 만들 수 있어요!"
- "❤️ 후기 공유 정말 감사합니다! Memory Weaver가 더 많은 분들께 알려지게 해주셔서 고마워요. 추가 앨범 +1 완료!"
- "🌟 최고의 리뷰예요! 덕분에 오늘 하나 더 만들 수 있게 됐어요. Memory Weaver와 함께 더 많은 추억을 만들어 보세요!"
- "🎁 후기 업로드 확인 완료! 추가 앨범 생성권이 지급되었습니다. 지금 바로 새로운 앨범을 만들어 보세요!"

If approved=true, always pick ONE of the above success_messages (or a very similar natural variation)
and put it in success_message.
daily_limit_info should be empty string unless daily_extra_used_today was true.
Never output anything except the JSON.`;

export const verifyReviewScreenshot = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        imageDataUrl: z.string().min(20).max(8_000_000),
        dailyExtraUsedToday: z.boolean(),
      })
      .parse(input)
  )
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return {
        approved: false,
        reason: "Server not configured.",
        confidence: 0,
        success_message: "",
        daily_limit_info: "",
        error: "missing_api_key",
      };
    }

    const userPayload = JSON.stringify({ daily_extra_used_today: data.dailyExtraUsedToday });

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
      return {
        approved: false,
        reason: "Network error.",
        confidence: 0,
        success_message: "",
        daily_limit_info: "",
        error: "network",
      };
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
      return {
        approved: false,
        reason:
          resp.status === 429
            ? "Too many requests. Please try again in a moment."
            : resp.status === 402
            ? "AI usage limit reached."
            : "AI verification failed.",
        confidence: 0,
        success_message: "",
        daily_limit_info: "",
        error: err,
      };
    }

    const json = await resp.json().catch(() => null) as any;
    const content: string | undefined = json?.choices?.[0]?.message?.content;
    if (!content) {
      return {
        approved: false,
        reason: "Empty AI response.",
        confidence: 0,
        success_message: "",
        daily_limit_info: "",
        error: "empty_response",
      };
    }

    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      // try to extract JSON
      const m = content.match(/\{[\s\S]*\}/);
      if (m) {
        try { parsed = JSON.parse(m[0]); } catch {}
      }
    }
    if (!parsed || typeof parsed.approved !== "boolean") {
      return {
        approved: false,
        reason: "Unexpected AI response.",
        confidence: 0,
        success_message: "",
        daily_limit_info: "",
        error: "parse_error",
      };
    }

    return {
      approved: !!parsed.approved,
      reason: typeof parsed.reason === "string" ? parsed.reason : "",
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
      success_message: typeof parsed.success_message === "string" ? parsed.success_message : "",
      daily_limit_info: typeof parsed.daily_limit_info === "string" ? parsed.daily_limit_info : "",
    };
  });
