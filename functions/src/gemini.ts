// Tiny Gemini REST client used by the Cloud Functions.
// API key is read from process.env.GEMINI_API_KEY (Functions secret).

const MODEL = "gemini-2.5-flash-lite";
const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export type OpenAIContent =
  | string
  | Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    >;

export type OpenAIMessage = { role: "user" | "assistant" | "system"; content: OpenAIContent };

function dataUrlToInlineData(url: string): { mimeType: string; data: string } | null {
  const m = /^data:([^;]+);base64,(.+)$/.exec(url);
  if (!m) return null;
  return { mimeType: m[1], data: m[2] };
}

function toGeminiParts(content: OpenAIContent): any[] {
  if (typeof content === "string") return [{ text: content }];
  const out: any[] = [];
  for (const p of content) {
    if (p.type === "text") out.push({ text: p.text });
    else if (p.type === "image_url") {
      const inline = dataUrlToInlineData(p.image_url.url);
      if (inline) out.push({ inlineData: inline });
      else out.push({ fileData: { fileUri: p.image_url.url, mimeType: "image/jpeg" } });
    }
  }
  return out;
}

export function toGeminiRequest(messages: OpenAIMessage[], opts?: { tools?: any[]; toolConfig?: any }) {
  const systemTexts: string[] = [];
  const contents: any[] = [];
  for (const m of messages) {
    if (m.role === "system") {
      systemTexts.push(typeof m.content === "string" ? m.content : "");
      continue;
    }
    contents.push({
      role: m.role === "assistant" ? "model" : "user",
      parts: toGeminiParts(m.content),
    });
  }
  const body: any = { contents };
  if (systemTexts.length) body.systemInstruction = { parts: [{ text: systemTexts.join("\n\n") }] };
  if (opts?.tools) body.tools = opts.tools;
  if (opts?.toolConfig) body.toolConfig = opts.toolConfig;
  return body;
}

function getKey(): string {
  const k = process.env.GEMINI_API_KEY;
  if (!k) throw new Error("GEMINI_API_KEY not configured");
  return k;
}

export async function geminiGenerate(body: any): Promise<any> {
  const url = `${BASE}/${MODEL}:generateContent?key=${getKey()}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Gemini error ${res.status}: ${txt}`);
  }
  return res.json();
}

/** Stream text deltas from Gemini SSE. Yields plain text chunks. */
export async function* geminiStreamText(body: any): AsyncGenerator<string> {
  const url = `${BASE}/${MODEL}:streamGenerateContent?alt=sse&key=${getKey()}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Gemini stream error ${res.status}: ${txt}`);
  }
  const reader = (res.body as any).getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) !== -1) {
      const raw = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!raw.startsWith("data:")) continue;
      const json = raw.slice(5).trim();
      if (!json || json === "[DONE]") continue;
      try {
        const obj = JSON.parse(json);
        const parts = obj?.candidates?.[0]?.content?.parts ?? [];
        for (const p of parts) if (p.text) yield p.text as string;
      } catch {
        // ignore malformed line
      }
    }
  }
}
