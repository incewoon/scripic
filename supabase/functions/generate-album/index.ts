// @ts-nocheck
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function systemFor(lang: string) {
  if (lang === "ko") {
    return `당신은 추억을 풍부하고 따뜻한 산문으로 엮는 작가입니다.
- 대화에 등장한 디테일(장소, 인물, 감정, 농담, 작은 순간들)을 **최대한 많이** 요약에 담으세요.
- 각 캡션은 해당 사진(번호)에 대한 대화 내용에 정확히 매칭되어야 합니다. 대화에서 어떤 사진을 가리키는지 추론하세요.
- 한국어, 시적이지만 구체적으로.`;
  }
  return `You are a writer weaving memories into rich, warm prose.
- Pack as many concrete details from the conversation (places, people, feelings, jokes, small moments) into the summary as possible.
- Each caption must match the conversation about THAT specific photo (by number). Infer which photo the user was talking about.
- Write in English, poetic but specific.`;
}

function userPrompt(lang: string, photoCount: number, transcript: string, period?: string, location?: string) {
  if (lang === "ko") {
    return `사진 ${photoCount}장 (사진 1 ~ 사진 ${photoCount}).
${period ? `촬영 기간(EXIF): ${period}\n` : ""}${location ? `장소(EXIF): ${location}\n` : ""}대화 기록:
${transcript}

요청:
- title: 8자 이내 감성 제목
- subtitle: 20자 이내 한 줄
- period: ${period ? `"${period}" 그대로 사용` : "대화에서 추정 가능한 짧은 기간 (예: 26.4.24~25), 없으면 빈 문자열"}
- location: ${location ? `"${location}" 그대로 사용` : "대화에서 도시 정도로 짧게 (예: 대전, 금산), 없으면 빈 문자열"}
- intro: **5~8문장**, 대화 내용의 디테일을 풍부하게 살려서
- captions: 사진 ${photoCount}개에 정확히 매칭되는 캡션 배열, 각 캡션은 해당 사진에 대한 대화 내용 기반 (40~60자)
- closing: 따뜻한 마무리 2~3문장`;
  }
  return `${photoCount} photos (Photo 1 ~ Photo ${photoCount}).
${period ? `Date range (EXIF): ${period}\n` : ""}${location ? `Location (EXIF): ${location}\n` : ""}Conversation:
${transcript}

Produce:
- title: short evocative title (max ~6 words)
- subtitle: one line (max ~10 words)
- period: ${period ? `use "${period}" as-is` : "infer a short range like 26.4.24~25 from the conversation, or empty string"}
- location: ${location ? `use "${location}" as-is` : "city-level, e.g. Daejeon, Geumsan; empty string if unknown"}
- intro: **5–8 sentences**, packing in concrete details from the conversation
- captions: exactly ${photoCount} captions, each matching the conversation about THAT photo (about 12–20 words)
- closing: warm 2–3 sentence closing`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { messages, photoCount, lang = "en", period, location } = await req.json();
    const KEY = Deno.env.get("LOVABLE_API_KEY");

    const transcript = messages
      .map((m: any) => `${m.role === "user" ? "User" : "AI"}: ${typeof m.content === "string" ? m.content : (m.content.find?.((c: any) => c.type === "text")?.text ?? "(photos)")}`)
      .join("\n");

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemFor(lang) },
          { role: "user", content: userPrompt(lang, photoCount, transcript, period, location) },
        ],
        tools: [{
          type: "function",
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
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "create_album" } },
      }),
    });

    if (!resp.ok) {
      const t = await resp.text();
      return new Response(JSON.stringify({ error: t }), {
        status: resp.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const data = await resp.json();
    const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    const album = JSON.parse(args);
    return new Response(JSON.stringify(album), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
