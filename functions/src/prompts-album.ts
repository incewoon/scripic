// Prompts for the album generation function. Ported from the original
// Supabase edge function.

export type Mode = "creative" | "fact" | "brief";
export type Tone = "politely" | "friendly" | "short";

export function toneInstruction(lang: string, tone: Tone) {
  const ko = lang === "ko";
  if (tone === "friendly") {
    if (ko) return `\n\n[어조 지침 — 말투만 정의합니다. 내용 구성 방식은 위 지침을 따르세요.]\n친한 친구에게 말하거나 자신에게 일기 쓰듯 편안한 반말로 작성하세요.\n예: "~였어", "~지", "~야", "~더라". 격식체·존댓말 절대 금지.`;
    return `\n\n[Tone instruction — defines style only. Content rules follow the system prompt above.]\nWrite as if talking to a close friend or journaling to yourself.\nUse casual, informal language (contractions, everyday phrasing). No formal tone.`;
  }
  if (tone === "short") {
    if (ko) return `\n\n[어조 지침 — 말투만 정의합니다. 내용 구성 방식은 위 지침을 따르세요.]\n주어를 생략하고 핵심 단어 중심의 짧고 파편화된 문장으로 작성하세요.\n종결은 "~함", "~음", "~였음" 같은 음슴체.\n격식체·존댓말 절대 금지.`;
    return `\n\n[Tone instruction — defines style only. Content rules follow the system prompt above.]\nDrop subjects ('I', 'It', etc.) and write in short, fragmented sentences.\nText-speak style, like a quick note to yourself.`;
  }
  if (ko) return `\n\n[어조 지침 — 말투만 정의합니다. 내용 구성 방식은 위 지침을 따르세요.]\n정중한 존댓말("~입니다", "~습니다", "~했습니다")로 단정하게 작성하세요.\n반말 절대 금지.`;
  return `\n\n[Tone instruction — defines style only. Content rules follow the system prompt above.]\nWrite in a polite, formal tone with complete sentences.`;
}

export function albumSystem(lang: string, mode: Mode) {
  const ko = lang === "ko";
  if (mode === "fact") {
    if (ko) return `당신은 대화에서 확인된 사실만으로 앨범 텍스트를 정리하는 기록자입니다.
[이 지침은 내용의 사실성을 정의합니다. 말투·어조는 아래 별도 어조 지침을 따르세요.]
- 허구·상상·추정 절대 금지. 사용자가 대화에서 직접 말한 내용만 사용하세요.
- 없는 내용을 부풀리거나 추가하지 마세요. (※ 어조 지침에 따른 말투 변화는 허용)
- 사용자의 표현을 그대로 옮기되 자연스럽게 다듬으세요.
- 캡션 개수는 정확히 사진 개수와 같아야 합니다.`;
    return `You are a recorder organizing album text using only facts from the conversation.
[This prompt defines content fidelity only. Tone and style follow the separate tone instruction below.]
- No fiction, imagination, or guessing. Use only what the user explicitly said. (※ Tone adjustments per the tone instruction are permitted.)
- Captions count must exactly match photo count.`;
  }
  if (mode === "brief") {
    if (ko) return `당신은 대화 내용을 핵심만 추려 간결하게 정리하는 작가입니다.
[이 지침은 내용의 간결함을 정의합니다. 말투·어조는 아래 별도 어조 지침을 따르세요.]
- 불필요한 세부 내용은 생략하고 핵심 사실만 담으세요.
- 캡션 개수는 정확히 사진 개수와 같아야 합니다.`;
    return `You are a writer who distills conversations to their essence.
[This prompt defines content brevity only. Tone and style follow the separate tone instruction below.]
- Omit unnecessary detail; keep only the key facts.
- Captions count must match photo count exactly.`;
  }
  if (ko) return `당신은 추억을 풍부한 산문으로 엮는 작가입니다.
[이 지침은 내용의 풍부함을 정의합니다. 말투·어조는 아래 별도 어조 지침을 따르세요.]
- 대화의 디테일을 최대한 담고, 사실을 바탕으로 감성적 묘사를 자유롭게 더하세요.
- 캡션 개수는 정확히 사진 개수와 같아야 합니다.
- 한국어로 작성하세요.`;
  return `You are a writer weaving memories into rich prose.
[This prompt defines content richness only. Tone and style follow the separate tone instruction below.]
- Pack in concrete details from the conversation; add evocative, expressive language freely.
- Captions count must exactly match photo count.`;
}

function modeSpec(ko: boolean, mode: Mode, photoCount: number, period?: string, location?: string) {
  if (mode === "fact") {
    return ko
      ? `- title: 8자 이내, 사실적
- subtitle: 20자 이내
- period: ${period ? `"${period}" 그대로` : "없으면 빈 문자열"}
- location: ${location ? `"${location}" 그대로` : "없으면 빈 문자열"}
- intro: 4~7문장, 사실 정리
- captions: 정확히 ${photoCount}개, 40~60자, 추측 금지
- closing: 1~2문장 중립`
      : `- title: short factual title
- subtitle: one factual line
- period/location: as provided (if missing, empty string)
- intro: 4–7 sentences, fact-based
- captions: exactly ${photoCount}, 12–20 words each, no guessing
- closing: 1–2 neutral sentences`;
  }
  if (mode === "brief") {
    return ko
      ? `- title: 8자 이내
- subtitle: 15자 이내
- period/location: 짧게
- intro: 2~3문장
- captions: ${photoCount}개, 15자 내외
- closing: 1문장`
      : `- title: short
- subtitle: one short line
- period/location: short
- intro: 2–3 sentences
- captions: exactly ${photoCount}, 6–10 words each
- closing: single sentence`;
  }
  return ko
    ? `- title: 8자 이내 감성 제목
- subtitle: 20자 이내
- period: ${period ? `"${period}" 그대로` : "추정 가능한 짧은 기간 또는 빈 문자열"}
- location: ${location ? `"${location}" 그대로` : "도시 정도 또는 빈 문자열"}
- intro: 5~8문장, 디테일 풍부
- captions: 정확히 ${photoCount}개, 40~60자
- closing: 따뜻한 2~3문장`
    : `- title: short evocative title
- subtitle: one line
- period/location: as provided (if missing, brief estimate or empty string)
- intro: 5–8 sentences, detail-rich
- captions: exactly ${photoCount}, 12–20 words each
- closing: warm 2–3 sentences`;
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

  const captionExample = ko
    ? `["사진1 캡션", "사진2 캡션", ...]`
    : `["Photo 1 caption", "Photo 2 caption", ...]`;
  const jsonFormat = `{ "title": "...", "subtitle": "...", "period": "...", "location": "...", "intro": "...", "captions": ${captionExample}, "closing": "..." }`;

  if (ko) {
    return `사진 ${photoCount}장 (사진 1 ~ 사진 ${photoCount}).
${period ? `촬영 기간(EXIF): ${period}\n` : ""}${location ? `장소(EXIF): ${location}\n` : ""}대화 기록:
${transcript}

요청: 아래 스펙에 맞춰 앨범 텍스트를 작성하세요. 반드시 아래 JSON 형식으로만 출력하세요. 마크다운 코드블록·설명·전처리 없이 JSON 객체만 출력하세요.

[출력 스펙]
${spec}

출력 형식:
${jsonFormat}`;
  }

  return `${photoCount} photos (Photo 1 ~ Photo ${photoCount}).
${period ? `Date range (EXIF): ${period}\n` : ""}${location ? `Location (EXIF): ${location}\n` : ""}Conversation:
${transcript}

Produce album text according to the spec below. Output MUST be valid JSON only. No markdown code blocks, no preamble, no explanation — JSON object only.

[Output Spec]
${spec}

Output format:
${jsonFormat}`;
}
