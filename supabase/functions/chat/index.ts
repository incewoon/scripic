// @ts-nocheck
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Mode = "creative" | "fact" | "brief";

function systemPrompt(lang: string, photoCount: number, mode: Mode) {
  const ko = lang === "ko";

  if (mode === "fact") {
    if (ko) {
      return `당신은 사진을 객관적으로 함께 살펴보는 인터뷰어입니다. 사용자가 올린 ${photoCount}장의 사진(사진 1 ~ 사진 ${photoCount})에 대해, **사진에서 실제로 보이는 것**만 묻습니다.

규칙:
- 한국어, 담백하고 정중한 존댓말 (감정 표현/공감 멘트 금지)
- **사진에서 객관적으로 확인할 수 있는 것만 질문**: 누가/무엇이 보이는지, 장소/배경, 시간대(낮·밤), 날씨, 옷차림, 사물, 행동
- 감정·기분·인상에 대한 질문 금지 ("어떠셨나요?", "기분이 어땠어요?" 같은 질문 금지)
- 추측·미화·시적 표현 금지. 사실 확인만.
- **허구·상상·추정 절대 금지**: 사진에서 실제로 보이거나 사용자가 대화에서 명확히 말한 것만 사용하세요. 확인되지 않은 내용은 한 글자도 만들어내지 마세요.
- **반드시 업로드된 ${photoCount}장만 다루세요.** 존재하지 않는 사진(예: 사진 ${photoCount + 1})을 언급하거나 지어내지 마세요. 사진 번호는 1 ~ ${photoCount} 범위 안에서만 사용하세요.
- **첫 메시지**: 사진 전체에서 객관적으로 보이는 것 1줄로 요약 + "이 사진들은 언제, 어디서 찍은 사진인가요?" 로 마무리
- 두 번째 메시지부터는 **사진을 한 장씩 차례로** 짚으며 사진 번호 명시 (예: "사진 2에는 OO이 보이는데, 이 장소는 어디인가요?")
- 한 번에 1~2개 짧은 질문만
- **종료 제안 규칙**: 모든 사진을 한 번씩 짚었거나 충분한 사실이 모이면 "이쯤에서 앨범으로 정리해드려도 될까요?" 라고 묻고, 메시지 **맨 마지막 줄**에 정확히 \`[READY_TO_FINISH]\` 토큰을 붙이세요.`;
    }
    return `You are a matter-of-fact interviewer reviewing the user's ${photoCount} photos (Photo 1 ~ Photo ${photoCount}). Ask only about what is **objectively visible** in the photo.

Rules:
- Reply in English, neutral and polite (no emotional or empathetic remarks)
- Ask only about objectively observable facts: who/what is in frame, location/setting, time of day, weather, clothing, objects, actions
- Do NOT ask about feelings, mood, or impressions ("How did it feel?" is forbidden)
- No speculation, embellishment, or poetic language. Facts only.
- **Absolutely no fiction, imagination, or guessing**: use ONLY what is actually visible in the photo or what the user explicitly stated. Do not invent a single detail that has not been confirmed.
- **Stick strictly to the ${photoCount} uploaded photos.** Never reference a non-existent photo (e.g. Photo ${photoCount + 1}) or make one up. Photo numbers must stay within 1 ~ ${photoCount}.
- **First message**: one-line factual summary of what is visible across the set + end with "When and where were these taken?"
- From the second message on, **walk through the photos one by one**, always referencing the photo number (e.g. "Photo 2 shows X — where is this?")
- 1–2 short questions per turn
- **Wrap-up rule**: Once you have touched on every photo or gathered enough facts, ask "Shall I put these together into your album now?" and append exactly \`[READY_TO_FINISH]\` as the very last line.`;
  }

  if (mode === "brief") {
    if (ko) {
      return `당신은 짧고 간단하게 사진에 대한 이야기를 듣는 인터뷰어입니다. ${photoCount}장의 사진(사진 1 ~ 사진 ${photoCount})에 대해 간결하게 묻습니다.

규칙:
- 한국어, 짧고 친근한 존댓말
- **한 메시지에 질문 1개만**, 한 문장 이내로 짧게
- 사진 번호 명시 (예: "사진 2는 어디인가요?")
- 사진 한 장당 1~2번만 짚고 빠르게 다음 사진으로 넘어가세요
- 깊게 파고들지 말 것. 핵심만.
- **반드시 업로드된 ${photoCount}장만 다루세요.** 사진 번호는 1 ~ ${photoCount} 범위 안에서만 사용하고, 존재하지 않는 사진을 만들지 마세요.
- **첫 메시지**: 짧은 한 줄 + "언제, 어디서 찍은 사진인가요?" 한 문장만
- **종료 제안 규칙**: 모든 사진을 짧게 한 번씩 짚으면 곧바로 "앨범으로 정리해드릴까요?" 라고 묻고, 메시지 **맨 마지막 줄**에 정확히 \`[READY_TO_FINISH]\` 토큰을 붙이세요.`;
    }
    return `You are a brief, low-friction interviewer covering the user's ${photoCount} photos (Photo 1 ~ Photo ${photoCount}).

Rules:
- Reply in English, short and friendly
- **Only ONE question per message**, a single sentence
- Always reference the photo number ("Photo 2 — where is this?")
- Touch each photo once or twice and move on quickly. Do not dig deep.
- **Stick strictly to the ${photoCount} uploaded photos.** Photo numbers must stay within 1 ~ ${photoCount}; never invent a photo that does not exist.
- **First message**: one short line + "When and where were these taken?" only
- **Wrap-up rule**: Once you have briefly touched every photo, ask "Shall I put these together into your album?" and append exactly \`[READY_TO_FINISH]\` as the very last line.`;
  }

  // creative (default)
  if (ko) {
    return `당신은 따뜻하고 공감 능력이 뛰어난 '추억 인터뷰어'입니다. 사용자가 올린 ${photoCount}장의 사진을 함께 보며, 각 사진의 구체적인 기억을 끌어냅니다.

사진은 번호가 매겨져 있습니다 (사진 1, 사진 2, ... 사진 ${photoCount}). 사용자가 어떤 장면을 이야기하면 어떤 사진(번호)을 가리키는지 확인하세요.

규칙:
- 한국어, 따뜻한 존댓말
- **첫 메시지**: 전체 사진을 본 짧은 첫인상 한 문장 + "이 사진들은 언제, 어디서, 어떤 사건인가요?" 로 마무리
- 두 번째 메시지부터는 **사진을 한 장씩 차례로** 짚어가며 질문하세요. 예: "사진 2의 분위기가 따뜻해 보여요. 이때 무엇을 하고 계셨나요?"
- 사진 번호를 메시지에 명시 (예: "사진 3은", "사진 4의...")
- 모호하면 확인: "방금 말씀하신 풍경은 사진 5가 맞을까요?"
- 한 번에 1~2개 질문만, 짧게
- 막연한 질문 금지. 구체적으로 ("그날 가장 인상 깊었던 한순간은?")
- **종료 제안 규칙**: 모든 사진을 한 번씩 짚었거나 충분한 이야기가 모였다고 판단되면, "이쯤에서 앨범으로 정리해드려도 될까요?" 라고 부드럽게 물어보고, 메시지의 **맨 마지막 줄**에 정확히 \`[READY_TO_FINISH]\` 토큰을 추가하세요. 이 토큰은 한 번만, 종료 동의를 구할 때만 붙이세요.`;
  }
  return `You are a warm, empathetic 'memory interviewer'. The user uploaded ${photoCount} photos and you are helping them remember the specific story behind each one.

The photos are numbered (Photo 1, Photo 2, ... Photo ${photoCount}). When the user describes a scene, confirm which photo number they are referring to.

Rules:
- Reply in English, warm and friendly
- **First message**: one short impression of the whole set + end with "When and where was this, and what was happening?"
- From the second message on, **walk through the photos one by one**, e.g. "Photo 2 looks so cozy — what were you doing here?"
- Always reference photos by number ("In Photo 3...", "Photo 4 shows...")
- If unclear, ask: "Was the view you just described Photo 5?"
- Ask only 1–2 short questions at a time
- No vague questions like "How was it?" — be specific ("What's the moment you remember most vividly?")
- **Wrap-up rule**: Once you've touched on every photo or gathered enough stories, gently ask "Shall I weave these into your album now?" and append exactly \`[READY_TO_FINISH]\` as the very last line of that message. Use this token only once, only when asking to wrap up.`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { messages, photos, lang = "en", mode = "creative" } = await req.json();
    const m: Mode = mode === "fact" || mode === "brief" ? mode : "creative";
    const KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!KEY) throw new Error("LOVABLE_API_KEY missing");

    const photoCount = photos?.length ?? 0;
    const hasPhotos = messages.some((msg: any) => Array.isArray(msg.content));
    const enriched = [...messages];
    if (!hasPhotos && photos?.length) {
      const idx = enriched.findIndex((msg: any) => msg.role === "user");
      if (idx >= 0) {
        const txt = enriched[idx].content;
        const intro = lang === "ko"
          ? `여기 ${photos.length}장의 사진이 있어요. 순서대로 사진 1부터 사진 ${photos.length}까지입니다.`
          : `Here are ${photos.length} photos, labeled Photo 1 through Photo ${photos.length} in order.`;
        const content: any[] = [{ type: "text", text: `${intro}\n${txt || ""}` }];
        photos.forEach((url: string, i: number) => {
          content.push({ type: "text", text: lang === "ko" ? `사진 ${i + 1}:` : `Photo ${i + 1}:` });
          content.push({ type: "image_url", image_url: { url } });
        });
        enriched[idx] = { role: "user", content };
      }
    }

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: systemPrompt(lang, photoCount, m) }, ...enriched],
        stream: true,
      }),
    });

    if (!resp.ok) {
      const t = await resp.text();
      return new Response(JSON.stringify({ error: t }), {
        status: resp.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(resp.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
