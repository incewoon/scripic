// Temporary fallback for the Firebase `chat` callable, used while Firebase
// is not yet configured (e.g. inside the Lovable web preview).
//
// Calls the Lovable AI Gateway with Gemini 2.5 Flash-Lite and streams
// SSE deltas back to the client (OpenAI-compatible chunks).
//
// The client (src/lib/aiClient.ts) parses delta tokens from `choices[0].delta.content`.

import { chatSystemPrompt, turnLimitClause, type Mode } from "../_shared/prompts-chat.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };
type Msg = { role: "user" | "assistant" | "system"; content: string | ContentPart[] };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const {
      messages,
      photos,
      photoCount: pcFromClient,
      lang = "en",
      mode = "creative",
      maxTurnsPerPhoto: rawCap,
    } = (await req.json()) as {
      messages: Msg[];
      photos?: string[];
      photoCount?: number;
      lang?: string;
      mode?: Mode;
      maxTurnsPerPhoto?: number;
    };

    if (!Array.isArray(messages) || messages.length === 0) {
      return json({ error: "messages required" }, 400);
    }

    const m: Mode = mode === "fact" || mode === "brief" ? mode : "creative";
    const maxTurnsPerPhoto =
      typeof rawCap === "number" && rawCap > 0 ? Math.min(20, Math.floor(rawCap)) : 3;
    const photoCount =
      typeof pcFromClient === "number" && pcFromClient > 0 ? pcFromClient : photos?.length ?? 0;

    // Inject photos on the opening user turn.
    const enriched: Msg[] = [...messages];
    const hasPhotos = enriched.some((msg) => Array.isArray(msg.content));
    if (!hasPhotos && photos?.length) {
      const idx = enriched.findIndex((msg) => msg.role === "user");
      if (idx >= 0) {
        const txt =
          typeof enriched[idx].content === "string" ? (enriched[idx].content as string) : "";
        const intro =
          lang === "ko"
            ? `여기 ${photos.length}장의 사진이 있어요. 순서대로 사진 1부터 사진 ${photos.length}까지입니다.`
            : `Here are ${photos.length} photos, labeled Photo 1 through Photo ${photos.length} in order.`;
        const content: ContentPart[] = [{ type: "text", text: `${intro}\n${txt}` }];
        photos.forEach((url, i) => {
          content.push({
            type: "text",
            text: lang === "ko" ? `사진 ${i + 1}:` : `Photo ${i + 1}:`,
          });
          content.push({ type: "image_url", image_url: { url } });
        });
        enriched[idx] = { role: "user", content };
      }
    }

    const system =
      chatSystemPrompt(lang, photoCount, m) + turnLimitClause(lang, photoCount, maxTurnsPerPhoto);

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "LOVABLE_API_KEY not configured" }, 500);

    const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [{ role: "system", content: system }, ...enriched],
        stream: true,
      }),
    });

    if (!upstream.ok) {
      if (upstream.status === 429) return json({ error: "rate_limited" }, 429);
      if (upstream.status === 402) return json({ error: "payment_required" }, 402);
      const t = await upstream.text();
      console.error("AI gateway error:", upstream.status, t);
      return json({ error: "ai_gateway_error" }, 500);
    }

    return new Response(upstream.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat-fallback error:", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
