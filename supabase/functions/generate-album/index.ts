// @ts-nocheck
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Mode = "creative" | "fact" | "brief";

function systemFor(lang: string, mode: Mode) {
  const ko = lang === "ko";

  if (mode === "fact") {
    if (ko) {
      return `당신은 대화에서 확인된 사실만으로 앨범 텍스트를 정리하는 기록자입니다.
- **허구·상상·추정 절대 금지.** 대화에 실제로 나오거나 사진에서 객관적으로 확인된 내용만 사용하세요. 한 글자도 지어내지 마세요.
- 추측, 감정 묘사, 미화, 시적 표현 금지.
- 가능하면 사용자의 표현을 그대로 옮기되, 자연스러운 문장으로 다듬으세요.
- 요약하지 말고, 대화에서 언급된 사실들을 빠짐없이 정리하세요.
- 각 캡션은 해당 사진(번호)에 대한 대화 내용에 기반해야 합니다. 대화에 해당 사진 관련 정보가 없으면 사진에서 객관적으로 보이는 사실만 짧게 적으세요.
- **캡션 개수는 정확히 업로드된 사진 개수와 같아야 합니다. 더 많거나 적으면 안 됩니다.**
- 한국어, 담백하고 중립적인 문체.`;
    }
    return `You are a recorder who organizes album text using only facts stated in the conversation.
- **Absolutely no fiction, imagination, or guessing.** Use ONLY what was actually said in the conversation or what is objectively visible in the photo. Do not invent a single detail.
- No speculation, emotional embellishment, or poetic language.
- Preserve the user's wording where possible; clean up only for readability.
- Do not summarize away facts — keep all concrete details that were mentioned.
- Each caption must be based on the conversation about THAT specific photo (by number). If the conversation has nothing about that photo, write only what is objectively visible in it.
- **The number of captions must exactly match the number of uploaded photos — no more, no less.**
- Write in English, neutral and matter-of-fact.`;
  }

  if (mode === "brief") {
    if (ko) {
      return `당신은 대화 내용을 짧고 간결하게 요약하는 작가입니다.
- 핵심만 짧게. 군더더기 없이.
- 각 캡션은 해당 사진(번호)에 대한 대화 내용에 기반.
- **캡션 개수는 정확히 업로드된 사진 개수와 같아야 합니다.**
- 한국어, 단정한 문체.`;
    }
    return `You are a writer who summarizes conversations concisely.
- Keep it short and essential. No filler.
- Each caption must match the conversation about THAT specific photo (by number).
- **The number of captions must exactly match the number of uploaded photos.**
- Write in English, clean and tight.`;
  }

  if (ko) {
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

function userPrompt(lang: string, photoCount: number, transcript: string, mode: Mode, period?: string, location?: string) {
  const ko = lang === "ko";
  const header = ko
    ? `사진 ${photoCount}장 (사진 1 ~ 사진 ${photoCount}).
${period ? `촬영 기간(EXIF): ${period}\n` : ""}${location ? `장소(EXIF): ${location}\n` : ""}대화 기록:
${transcript}

요청:`
    : `${photoCount} photos (Photo 1 ~ Photo ${photoCount}).
${period ? `Date range (EXIF): ${period}\n` : ""}${location ? `Location (EXIF): ${location}\n` : ""}Conversation:
${transcript}

Produce:`;

  if (mode === "fact") {
    if (ko) {
      return `${header}
- title: 8자 이내, 사실적이고 담백한 제목 (예: "대전 주말", "할머니댁")
- subtitle: 20자 이내, 사실 한 줄
- period: ${period ? `"${period}" 그대로 사용` : "대화에서 확인 가능한 기간, 없으면 빈 문자열"}
- location: ${location ? `"${location}" 그대로 사용` : "대화에서 확인 가능한 장소, 없으면 빈 문자열"}
- intro: **대화에서 언급된 사실들을 시간 순/사진 순으로 자연스럽게 정리한 문단** (요약하지 말 것, 4~7문장)
- captions: 사진 ${photoCount}개에 정확히 매칭되는 캡션 배열, 각 캡션은 해당 사진에 대해 사용자가 말한 내용을 그대로 기반으로 (40~60자, 추측 금지)
- closing: 중립적인 마무리 1~2문장 (감정 표현 자제)`;
    }
    return `${header}
- title: short factual title (max ~6 words)
- subtitle: one factual line (max ~10 words)
- period: ${period ? `use "${period}" as-is` : "use only what's stated in the conversation, else empty"}
- location: ${location ? `use "${location}" as-is` : "use only what's stated in the conversation, else empty"}
- intro: **organize the stated facts into a natural paragraph in chronological/photo order — do NOT summarize away facts** (4–7 sentences)
- captions: exactly ${photoCount} captions, each based strictly on what the user said about THAT photo (about 12–20 words, no speculation)
- closing: neutral 1–2 sentence closing (avoid emotional language)`;
  }

  if (mode === "brief") {
    if (ko) {
      return `${header}
- title: 8자 이내 짧은 제목
- subtitle: 15자 이내 한 줄
- period: ${period ? `"${period}" 그대로 사용` : "짧게, 없으면 빈 문자열"}
- location: ${location ? `"${location}" 그대로 사용` : "짧게, 없으면 빈 문자열"}
- intro: 짧은 2~3문장 요약
- captions: 사진 ${photoCount}개에 매칭되는 짧은 캡션 (15자 내외)
- closing: 1문장 마무리`;
    }
    return `${header}
- title: short title (max ~5 words)
- subtitle: one short line (max ~8 words)
- period: ${period ? `use "${period}" as-is` : "short, or empty"}
- location: ${location ? `use "${location}" as-is` : "short, or empty"}
- intro: brief 2–3 sentence summary
- captions: exactly ${photoCount} short captions (about 6–10 words each)
- closing: single-sentence closing`;
  }

  // creative
  if (ko) {
    return `${header}
- title: 8자 이내 감성 제목
- subtitle: 20자 이내 한 줄
- period: ${period ? `"${period}" 그대로 사용` : "대화에서 추정 가능한 짧은 기간 (예: 26.4.24~25), 없으면 빈 문자열"}
- location: ${location ? `"${location}" 그대로 사용` : "대화에서 도시 정도로 짧게 (예: 대전, 금산), 없으면 빈 문자열"}
- intro: **5~8문장**, 대화 내용의 디테일을 풍부하게 살려서
- captions: 사진 ${photoCount}개에 정확히 매칭되는 캡션 배열, 각 캡션은 해당 사진에 대한 대화 내용 기반 (40~60자)
- closing: 따뜻한 마무리 2~3문장`;
  }
  return `${header}
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
    const { messages, photoCount, lang = "en", period, location, mode = "creative" } = await req.json();
    const m: Mode = mode === "fact" || mode === "brief" ? mode : "creative";
    const KEY = Deno.env.get("LOVABLE_API_KEY");

    const transcript = messages
      .map((msg: any) => `${msg.role === "user" ? "User" : "AI"}: ${typeof msg.content === "string" ? msg.content : (msg.content.find?.((c: any) => c.type === "text")?.text ?? "(photos)")}`)
      .join("\n");

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemFor(lang, m) },
          { role: "user", content: userPrompt(lang, photoCount, transcript, m, period, location) },
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
