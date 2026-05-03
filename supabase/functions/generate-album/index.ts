// @ts-nocheck
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM = `당신은 추억을 아름다운 짧은 스토리 앨범으로 엮는 작가입니다.
사용자와의 대화 내용과 사진 개수를 바탕으로 다음을 JSON으로 출력하세요:
- title: 앨범 제목 (8자 이내, 감성적)
- subtitle: 한 줄 부제 (20자 이내)
- intro: 앨범 도입 문장 (2-3문장)
- captions: 각 사진에 붙일 짧은 캡션 배열 (사진 수와 동일, 각 30자 이내)
- closing: 마무리 한 문장
한국어. 따뜻하고 시적으로.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { messages, photoCount } = await req.json();
    const KEY = Deno.env.get("LOVABLE_API_KEY");

    const transcript = messages
      .map((m: any) => `${m.role === "user" ? "나" : "AI"}: ${typeof m.content === "string" ? m.content : "(사진)"}`)
      .join("\n");

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `사진 ${photoCount}장.\n대화:\n${transcript}` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "create_album",
            description: "앨범 데이터 생성",
            parameters: {
              type: "object",
              properties: {
                title: { type: "string" },
                subtitle: { type: "string" },
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
