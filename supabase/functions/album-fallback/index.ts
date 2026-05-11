// Temporary fallback for the Firebase `generateAlbum` callable. Returns a
// structured album JSON via OpenAI-compatible tool calling on the Lovable
// AI Gateway (Gemini 2.5 Flash-Lite).

import {
  albumSystem,
  albumUserPrompt,
  toneInstruction,
  type Mode,
  type Tone,
} from "../_shared/prompts-album.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ALBUM_TOOL = {
  type: "function" as const,
  function: {
    name: "create_album",
    description: "Album data",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        subtitle: { type: "string" },
        period: { type: "string" },
        location: { type: "string" },
        intro: { type: "string" },
        captions: { type: "array", items: { type: "string" } },
        closing: { type: "string" },
      },
      required: ["title", "subtitle", "intro", "captions", "closing"],
      additionalProperties: false,
    },
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const {
      messages,
      photoCount,
      lang = "en",
      period,
      location,
      mode = "creative",
      tone = "politely",
    } = (await req.json()) as {
      messages: { role: string; content: any }[];
      photoCount: number;
      lang?: string;
      period?: string;
      location?: string;
      mode?: Mode;
      tone?: Tone;
    };

    if (!Array.isArray(messages) || messages.length === 0)
      return json({ error: "messages required" }, 400);
    if (!photoCount || photoCount < 1) return json({ error: "photoCount required" }, 400);

    const m: Mode = mode === "fact" || mode === "brief" ? mode : "creative";
    const tn: Tone = tone === "friendly" || tone === "short" ? tone : "politely";

    const transcript = messages
      .map((msg) => {
        const t =
          typeof msg.content === "string"
            ? msg.content
            : Array.isArray(msg.content)
            ? msg.content.find?.((c: any) => c.type === "text")?.text ?? "(photos)"
            : "";
        return `${msg.role === "user" ? "User" : "AI"}: ${t}`;
      })
      .join("\n");

    const system = albumSystem(lang, m) + toneInstruction(lang, tn);
    const userText = albumUserPrompt(lang, photoCount, transcript, m, period, location);

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "LOVABLE_API_KEY not configured" }, 500);

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: system },
          { role: "user", content: userText },
        ],
        tools: [ALBUM_TOOL],
        tool_choice: { type: "function", function: { name: "create_album" } },
      }),
    });

    if (!res.ok) {
      if (res.status === 429) return json({ error: "rate_limited" }, 429);
      if (res.status === 402) return json({ error: "payment_required" }, 402);
      const t = await res.text();
      console.error("AI gateway error:", res.status, t);
      return json({ error: "ai_gateway_error" }, 500);
    }

    const data = await res.json();
    const tc = data?.choices?.[0]?.message?.tool_calls?.[0];
    const argsStr = tc?.function?.arguments;
    if (!argsStr) {
      console.error("no tool_call in response", JSON.stringify(data));
      return json({ error: "no_album" }, 500);
    }
    let parsed: any;
    try {
      parsed = JSON.parse(argsStr);
    } catch {
      return json({ error: "bad_album_json" }, 500);
    }
    return json(parsed, 200);
  } catch (e) {
    console.error("album-fallback error:", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
