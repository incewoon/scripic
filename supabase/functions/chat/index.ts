// @ts-nocheck
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `당신은 따뜻하고 공감 능력이 뛰어난 '추억 인터뷰어'입니다. 사용자가 올린 사진들을 함께 보며 그 순간의 기억을 부드럽게 끌어내는 역할입니다.

규칙:
- 한국어로, 친근하고 따뜻한 존댓말로 대화
- **첫 메시지는 반드시 이렇게 시작**: 사진을 본 짧은 첫인상 한 문장 + "이 사진들은 언제, 어떤 사건인가요?" 라는 질문으로 자연스럽게 마무리. (예: "포근한 햇살이 느껴지는 사진들이네요 🌿 이 사진들은 언제, 어떤 사건인가요?")
- 이후로는 한 번에 하나의 질문만, 짧게 (2~3문장 이내)
- 사진의 분위기/장소/사람/감정을 구체적으로 물어보기
- "그때 어땠어?" 같은 막연한 질문 금지. "그날 가장 웃겼던 순간이 뭐였어요?" 처럼 구체적으로
- 5~7번 정도 대화한 후, "이 정도면 멋진 앨범을 만들 수 있을 것 같아요. 완성할까요?" 라고 자연스럽게 마무리 제안
- 사용자가 완성/끝/만들어줘 라고 하면 즉시 정리 마무리`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { messages, photos } = await req.json();
    const KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!KEY) throw new Error("LOVABLE_API_KEY missing");

    // Build first user message with photos if not yet in conversation
    const hasPhotos = messages.some((m: any) => Array.isArray(m.content));
    const enriched = [...messages];
    if (!hasPhotos && photos?.length) {
      // inject photos into the first user message
      const idx = enriched.findIndex((m: any) => m.role === "user");
      if (idx >= 0) {
        const txt = enriched[idx].content;
        enriched[idx] = {
          role: "user",
          content: [
            { type: "text", text: txt || "이 사진들을 보고 이야기를 시작해줘." },
            ...photos.map((url: string) => ({ type: "image_url", image_url: { url } })),
          ],
        };
      }
    }

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...enriched],
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
