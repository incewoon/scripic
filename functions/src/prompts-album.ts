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
        return `당신은 대화에서 확인된 사실만으로 앨범 텍스트를 정리하는 '기록자'입니다. 소설가가 아닙니다.
[이 지침은 내용의 사실성을 정의합니다. 말투·어조는 아래 별도 어조 지침을 따르세요.]
- 절대 금지: 허구·상상·추정·은유·시적 표현·감성적 묘사·미사여구.
- 대화 기록에는 사용자와 AI 두 발화자가 등장합니다. **오직 사용자가 언급한 내용만 사실로 취급**하세요. AI가 언급한 감성적 묘사·비유·풍경 표현·추정은 사용자가 말한 사실이 아니므로 결과물에 절대 옮기지 마세요.
- 사용자가 직접 말하지 않은 감정어(설렘·벅찬·아련한·따뜻한 등)·비유·의성어·의태어를 추가하지 마세요.
- 대화에 없는 디테일을 만들어 채우지 마세요.
- 형용사·부사·감탄사를 최소화하고, 간결하고 담백한 기록 문체로 작성.
- 사용자의 표현을 그대로 옮기되 자연스럽게 다듬으세요. 새 이야기를 만들지 마세요.
- 캡션 개수는 정확히 사진 개수와 같아야 합니다.`;
      return `You are a 'recorder' organizing album text using only facts from the conversation. You are NOT a novelist.
[This prompt defines content fidelity only. Tone and style follow the separate tone instruction below.]
- STRICTLY FORBIDDEN: fiction, imagination, guessing, metaphor, poetic phrasing, emotional embellishment, flowery language.
- The transcript contains two speakers: User and AI. **Treat ONLY the User Mentions as facts.** Any evocative descriptions, metaphors, scenery, or speculation on "AI:" lines are NOT things the user said — do not carry them into the output.
- Do not add emotional adjectives (thrilled, nostalgic, warm, etc.), metaphors, or expressive interjections the user did not explicitly say.
- Use only facts the user explicitly stated. Do not invent details not present in the conversation.
- Minimize adjectives/adverbs. Write in a plain, factual record style.
- Captions count must exactly match photo count.`;
    }
    case "summary": {
      if (ko)
        return `당신은 대화 내용을 핵심만 추려 간결하게 정리하는 작가입니다.
[이 지침은 내용의 간결함을 정의합니다. 말투·어조는 아래 별도 어조 지침을 따르세요.]
- 대화 기록에는 "User:"와 "AI:" 두 발화자가 등장합니다. **오직 "User:" 줄만 사실로 취급**하세요. "AI:" 줄의 감성적 묘사·추정은 사실로 옮기지 마세요.
- 불필요한 세부 내용은 생략하고 핵심 사실만 담으세요.
- 캡션 개수는 정확히 사진 개수와 같아야 합니다.`;
      return `You are a writer who distills conversations to their essence.
[This prompt defines content brevity only. Tone and style follow the separate tone instruction below.]
- The transcript contains "User:" and "AI:" lines. **Treat ONLY "User:" lines as facts.** Do not carry AI-generated descriptions or speculation into the output.
- Omit unnecessary detail; keep only the key facts.
- Captions count must match photo count exactly.`;
    }
    case "story": {
      if (ko)
        return `당신은 추억을 풍부한 산문으로 엮는 '이야기 작가'입니다.
[이 지침은 내용의 풍부함을 정의합니다. 말투·어조는 아래 별도 어조 지침을 따르세요.]
- 대화의 디테일을 최대한 담고, 사실을 바탕으로 감성적 묘사와 비유를 자유롭게 더하세요.
- 분위기·감정·장면을 풍성하게 그려내세요.
- 캡션 개수는 정확히 사진 개수와 같아야 합니다.
- 한국어로 작성하세요.`;
      return `You are a 'story writer' weaving memories into rich prose.
[This prompt defines content richness only. Tone and style follow the separate tone instruction below.]
- Pack in concrete details from the conversation; add evocative, expressive language and imagery freely.
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
- intro: 5~10문장, 사실 정리
- captions: 정확히 ${photoCount}개, 40~60자, 추측 금지
- closing: 2~3문장 중립`
        : `- title: short factual title
- subtitle: one factual line
- period: "${period || ""}" (if missing empty string)
- location: "${location || ""}" (if missing empty string)
- intro: 5–10 sentences, fact-based
- captions: exactly ${photoCount}, 12–20 words each, no guessing
- closing: 2–3 neutral sentences`;
    case "summary":
      return ko
        ? `- title: 8자 이내, 사실적
- subtitle: 15자 이내
- period: "${period || ""}" (없으면 빈 문자열)
- location: "${location || ""}" (없으면 빈 문자열)
- intro: 4~8문장, 사실 정리
- captions: 정확히 ${photoCount}개, 30~50자, 추측 금지
- closing: 1문장 중립`
        : `- title: short factual title
- subtitle: one factual line
- period: "${period || ""}" (if missing empty string)
- location: "${location || ""}" (if missing empty string)
- intro: 4–8 sentences, fact-based
- captions: exactly ${photoCount}, 8–15 words each, no guessing
- closing: 1 neutral sentences`;
    case "story":
      return ko
        ? `- title: 10자 이내 감성 제목
- subtitle: 20자 이내
- period: "${period || ""}" (없으면 빈 문자열)
- location: "${location || ""}" (없으면 빈 문자열)
- intro: 5~10문장, 디테일 풍부
- captions: 정확히 ${photoCount}개, 40~60자
- closing: 따뜻한 2~3문장`
        : `- title: short evocative title
- subtitle: one line
- period: "${period || ""}" (if missing empty string)
- location: "${location || ""}" (if missing empty string)
- intro: 5–10 sentences, detail-rich
- captions: exactly ${photoCount}, 12–20 words each
- closing: warm 2–3 sentences`;
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
