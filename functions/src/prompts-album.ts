// functions/src/prompts-album.ts

// Prompts for the album generation function. Ported from the original
// Supabase edge function.

export type Mode = "story" | "journal" | "summary";
export type Tone = "politely" | "friendly" | "short";

export function toneInstruction(lang: string, tone: Tone) {
  const ko = lang === "ko";
  if (tone === "friendly") {
    if (ko)
      return `\n\n[어조 지침 — 말투만 정의합니다. 내용 구성 방식은 위 지침을 따르세요.]\n친한 친구에게 말하거나 자신에게 일기 쓰듯 편안한 반말로 작성하세요.\n예: "~였어", "~지", "~야", "~더라". 격식체·존댓말 절대 금지.`;
    return `\n\n[Tone instruction — defines style only. Content rules follow the system prompt above.]\nWrite as if talking to a close friend or journaling to yourself.\nUse casual, informal language (contractions, everyday phrasing). No formal tone.`;
  }
  if (tone === "short") {
    if (ko)
      return `\n\n[어조 지침 — 말투만 정의합니다. 내용 구성 방식은 위 지침을 따르세요.]\n주어를 생략하고 핵심 단어 중심의 짧고 파편화된 문장으로 작성하세요.\n종결은 "~함", "~음", "~였음" 같은 음슴체.\n격식체·존댓말 절대 금지.`;
    return `\n\n[Tone instruction — defines style only. Content rules follow the system prompt above.]\nDrop subjects ('I', 'It', etc.) and write in short, fragmented sentences.\nText-speak style, like a quick note to yourself.`;
  }
  if (ko)
    return `\n\n[어조 지침 — 말투만 정의합니다. 내용 구성 방식은 위 지침을 따르세요.]\n정중한 존댓말("~입니다", "~습니다", "~했습니다")로 단정하게 작성하세요.\n반말 절대 금지.`;
  return `\n\n[Tone instruction — defines style only. Content rules follow the system prompt above.]\nWrite in a polite, formal tone with complete sentences.`;
}

export function albumSystem(lang: string, mode: Mode) {
  const ko = lang === "ko";
  switch (mode) {
    case "journal": {
      if (ko)
        return `나의 시점에서 기록을 정리하되 사실 중심, 감정 최소, 추측 금지로 메모를 정리해줘. 
[이 지침은 내용 구성을 정의합니다. 말투·어조는 아래 별도 어조 지침을 따르세요.]
- 대화 기록에서 AI가 언급한 내용을 제외하고 내가 언급한 내용만으로 정리해줘. 
- 허구·상상·추정·은유·시적 표현·감성적 묘사를 금지하고 대화에 없는 디테일을 만들어 채우지 말아줘
- "~하였다"보다 "~했다"를 우선 사용하세요.
- 캡션 개수는 정확히 사진 개수와 같아야 합니다.`;
      return `Organize my notes from my perspective, focusing only on facts, minimizing emotions, and avoiding speculation.
[This guideline defines the content organization. Tone and style follow the separate tone instruction below.]
- Summarize this based only on what I said, excluding anything the AI mentioned.
- Avoid fiction, imagination, assumptions, metaphors, poetic expressions, and emotional descriptions. 
- Do not fabricate or invent any details not present in the conversation.
- Minimize adjectives/adverbs. Write in a plain, factual record style.
- Captions count must exactly match photo count.`;
    }
    case "summary": {
      if (ko)
        return `당신은 불필요한 수식어 제거하고 핵심만 담은 검색용 메모를 정리하는 역할입니다.         
[이 지침은 내용의 간결함을 정의합니다. 말투·어조는 아래 별도 어조 지침을 따르세요.]
- 대화 기록에는 사용자와 AI 두 발화자가 등장합니다. **오직 사용자가 언급한 내용만 사실로 취급**하세요. "AI:" 줄의 감성적 묘사·추정은 사실로 옮기지 마세요.
- 불필요한 세부 내용은 생략하고 핵심 사실만 담으세요.
- 사용자를 "사용자"라고 부르지 마세요.
- 사용자의 경험을 1인칭 기록처럼 자연스럽게 정리하세요.
- 캡션 개수는 정확히 사진 개수와 같아야 합니다.`;
      return `You serve the role of organizing concise search notes, keeping only the essentials by removing unnecessary modifiers.
[This prompt defines content brevity only. Tone and style follow the separate tone instruction below.]
- The transcript contains User and AI lines. **Treat ONLY User mentions as facts.** Do not carry AI-generated descriptions or speculation into the output.
- Omit unnecessary detail; keep only the key facts.
- Never refer to the person as "the user".
- Write naturally as if it were the owner's own note.
- Captions count must match photo count exactly.`;
    }
    case "story": {
      if (ko)
        return `당신은 사용자의 대화를 추억을 다시 떠올리게 하는 글로 만드는 이야기꾼입니다.,
        사실 기반으로 감정 표현과 장면 묘사가 가능 하지만 대화에 없는 사건은 절대 만들지 않습니다. 
[이 지침은 내용의 풍부함을 정의합니다. 말투·어조는 아래 별도 어조 지침을 따르세요.]
- 대화의 디테일을 최대한 담고, 사실을 바탕으로 감성적 묘사와 비유를 자유롭게 더하세요.
- 분위기·감정·장면을 풍성하게 그려내세요.
- 캡션 개수는 정확히 사진 개수와 같아야 합니다.
- 사용자를 "사용자"라고 부르지 마세요.
- 사용자의 경험을 1인칭 기록처럼 자연스럽게 정리하세요.
- 한국어로 작성하세요.`;
      return `You are a storyteller who crafts the user's conversations into prose that evokes nostalgic memories. While you can express emotions and describe scenes based on facts, 
      you must never invent events that are not present in the conversation.
[This prompt defines content richness only. Tone and style follow the separate tone instruction below.]
- Pack in concrete details from the conversation; add evocative, expressive language and imagery freely.
- Never refer to the person as "the user".
- Write naturally as if it were the owner's own note.
- Captions count must exactly match photo count.`;
    }
    default:
      throw new Error(`albumSystem: unknown mode: ${String(mode)}`);
  }
}

function modeSpec(ko: boolean, mode: Mode, photoCount: number, period?: string, location?: string) {
  switch (mode) {
    case "journal":
      return ko
        ? `- title: 10자 이내, 사실적
- subtitle: 20자 이내
- period: "${period || ""}" (없으면 빈 문자열)
- location: "${location || ""}" (없으면 빈 문자열)
- intro: 2~8문장, 대화에서 언급된 사실만 작성, 문장이 부족하면 억지로 늘리지 않는다., 주어를 반복하지 않는 자연스러운 기록체, 사실 정리
- captions: 정확히 ${photoCount}개, 15~35자, 추측 금지, 가장 중요한 원칙은 결과물을 읽는 사람이 'AI가 정리했다'고 느끼지 않고,
사용자가 직접 자신의 기억을 정리한 글처럼 자연스럽게 읽히는 것입니다.
- closing: 1~2문장, 없어도 된다. 새로운 내용을 추가하지 않는다. 앞의 내용을 반복하지 않는다.`
        : `- title: short factual title
- subtitle: one factual line
- period: "${period || ""}" (if missing empty string)
- location: "${location || ""}" (if missing empty string)
- intro: 2–8 sentences, Natural journal style without repeating explicit subjects., Do not artificially stretch a sentence if it is insufficient., fact-based
- captions: exactly ${photoCount}, 12–20 words each, no guessing, Most importantly,
the final album should read as though the owner naturally wrote it, not as though it was generated by an AI.
- closing: Keep it to 1-2 sentences. It can be omitted. Do not add new content. Do not repeat the previous content.`;
    case "summary":
      return ko
        ? `- title: 8자 이내, 사실적
- subtitle: 15자 이내
- period: "${period || ""}" (없으면 빈 문자열)
- location: "${location || ""}" (없으면 빈 문자열)
- intro: 1~4문장, 대화에서 언급된 사실만 작성, 문장이 부족하면 억지로 늘리지 않는다., 사실 정리
- captions: 정확히 ${photoCount}개, 15~35자, 추측 금지
- closing: 1문장, 없어도 된다. 새로운 내용을 추가하지 않는다. 앞의 내용을 반복하지 않는다.`
        : `- title: short factual title
- subtitle: one factual line
- period: "${period || ""}" (if missing empty string)
- location: "${location || ""}" (if missing empty string)
- intro: 1–4 sentences, Natural journal style without repeating explicit subjects., Do not artificially stretch a sentence if it is insufficient., fact-based
- captions: exactly ${photoCount}, 8–15 words each, no guessing
- closing: Keep it to 1 sentences. It can be omitted. Do not add new content. Do not repeat the previous content.`;
    case "story":
      return ko
        ? `- title: 10자 이내 감성 제목
- subtitle: 20자 이내
- period: "${period || ""}" (없으면 빈 문자열)
- location: "${location || ""}" (없으면 빈 문자열)
- intro: 2~8문장, 대화에서 언급된 사실만 작성, 문장이 부족하면 억지로 늘리지 않는다.,디테일 풍부
- captions: 정확히 ${photoCount}개, 15~45자
- closing: 따뜻한 1~3문장, 없어도 된다. 새로운 내용을 추가하지 않는다. 앞의 내용을 반복하지 않는다.`
        : `- title: short evocative title
- subtitle: one line
- period: "${period || ""}" (if missing empty string)
- location: "${location || ""}" (if missing empty string)
- intro: 2–8 sentences, Detail-rich style without repeating explicit subjects., Do not artificially stretch a sentence if it is insufficient. 
- captions: exactly ${photoCount}, 12–20 words each
- closing:Keep it to 1-3 warm sentences. It can be omitted. Do not add new content. Do not repeat the previous content.`;
    default:
      throw new Error(`modeSpec: unknown mode: ${String(mode)}`);
  }
}

export function albumUserPrompt(
  lang: string,
  photoCount: number,
  transcript: string,
  mode: Mode,
  period?: string,
  location?: string,
) {
  const ko = lang === "ko";
  const spec = modeSpec(ko, mode, photoCount, period, location);

  const captionExample = ko ? `["사진1 캡션", "사진2 캡션", ...]` : `["Photo 1 caption", "Photo 2 caption", ...]`;
  const jsonFormat = `{ "title": "...", "subtitle": "...", "period": "...", "location": "...", "intro": "...", "captions": ${captionExample}, "closing": "..." }`;

  if (ko) {
    return `사진 ${photoCount}장 (사진 1 ~ 사진 ${photoCount}).
촬영 기간(EXIF): ${period || ""}
장소(EXIF): ${location || ""}
대화 기록:
${transcript}

요청: 아래 스펙에 맞춰 앨범 텍스트를 작성하세요. 반드시 아래 JSON 형식으로만 출력하세요. 마크다운 코드블록·설명·전처리 없이 JSON 객체만 출력하세요.

[출력 스펙]
${spec}

출력 형식:
${jsonFormat}`;
  }

  return `${photoCount} photos (Photo 1 ~ Photo ${photoCount}).
Date range (EXIF): ${period || ""}
Location (EXIF): ${location || ""}
Conversation:
${transcript}

Produce album text according to the spec below. Output MUST be valid JSON only. No markdown code blocks, no preamble, no explanation — JSON object only.

[Output Spec]
${spec}

Output format:
${jsonFormat}`;
}
