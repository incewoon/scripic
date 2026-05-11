// Mirror of functions/src/prompts-album.ts (Firebase) for the Supabase Deno runtime.

export type Mode = "creative" | "fact" | "brief";
export type Tone = "politely" | "friendly" | "short";

export function toneInstruction(lang: string, tone: Tone) {
  const ko = lang === "ko";
  if (tone === "friendly") {
    if (ko) return `\n\n[어조 — 매우 중요]\n친한 친구가 말하듯 아주 캐주얼한 반말로 작성하세요. 격식체/존댓말 절대 금지. 줄임말과 가벼운 구어체를 자연스럽게 사용하되 욕설은 쓰지 마세요. 예: "~했어", "~였지", "~더라". 너무 정중하거나 딱딱하지 않게.`;
    return `\n\n[Tone — VERY IMPORTANT]\nAct as my close friend. Keep your tone very casual, informal, and friendly. Use slang or contractions (like 'gonna', 'wanna') where appropriate. Don't be too formal or polite.`;
  }
  if (tone === "short") {
    if (ko) return `\n\n[어조 — 매우 중요]\n한국어 음슴체로 작성하세요. 주어("나는", "그것은" 등)를 생략하고, 문장을 아주 짧게 파편화해서 무심하고 빠르게 정리하세요. 종결은 "~함", "~음", "~였음" 같은 음슴체. 격식체/존댓말 금지.`;
    return `\n\n[Tone — VERY IMPORTANT]\nTalk to me in short, fragmented sentences. Drop the subjects (like 'I' or 'It') and use text-speak. Keep it extremely brief, like you're texting a close friend in a hurry.`;
  }
  if (ko) return `\n\n[어조 — 매우 중요]\n정중한 존댓말("~습니다", "~했습니다")로 단정하게 작성하세요. 반말 금지.`;
  return `\n\n[Tone — VERY IMPORTANT]\nWrite in a polite, formal tone with complete sentences.`;
}

export function albumSystem(lang: string, mode: Mode) {
  const ko = lang === "ko";
  if (mode === "fact") {
    if (ko) return `당신은 대화에서 확인된 사실만으로 앨범 텍스트를 정리하는 기록자입니다.
- 허구·상상·추정 절대 금지. 한 글자도 지어내지 마세요.
- 추측·미화·시적 표현 금지.
- 사용자의 표현을 그대로 옮기되 자연스럽게 다듬으세요.
- 캡션 개수는 정확히 사진 개수와 같아야 합니다.`;
    return `You are a recorder who organizes album text using only facts stated in the conversation.
- No fiction, imagination, or guessing.
- Captions count must exactly match photo count.`;
  }
  if (mode === "brief") {
    if (ko) return `당신은 대화 내용을 짧고 간결하게 요약하는 작가입니다. 캡션 개수는 정확히 사진 개수와 같아야 합니다.`;
    return `You are a writer who summarizes conversations concisely. Captions count must match photo count exactly.`;
  }
  if (ko) return `당신은 추억을 풍부하고 따뜻한 산문으로 엮는 작가입니다.
- 대화의 디테일을 최대한 담으세요.
- 캡션 개수는 정확히 사진 개수와 같아야 합니다.
- 한국어, 시적이지만 구체적으로.`;
  return `You are a writer weaving memories into rich, warm prose.
- Pack concrete details into the summary.
- Captions count must exactly match photo count.
- English, poetic but specific.`;
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
    return ko
      ? `${header}
- title: 8자 이내, 사실적
- subtitle: 20자 이내
- period: ${period ? `"${period}" 그대로` : "없으면 빈 문자열"}
- location: ${location ? `"${location}" 그대로` : "없으면 빈 문자열"}
- intro: 4~7문장, 사실 정리
- captions: 정확히 ${photoCount}개, 40~60자, 추측 금지
- closing: 1~2문장 중립`
      : `${header}
- title: short factual title
- subtitle: one factual line
- period/location: as above
- intro: 4–7 sentences, fact-based
- captions: exactly ${photoCount}, 12–20 words each
- closing: 1–2 neutral sentences`;
  }

  if (mode === "brief") {
    return ko
      ? `${header}
- title: 8자 이내
- subtitle: 15자 이내
- period/location: 짧게
- intro: 2~3문장
- captions: ${photoCount}개, 15자 내외
- closing: 1문장`
      : `${header}
- title: short
- subtitle: one short line
- period/location: short
- intro: 2–3 sentences
- captions: exactly ${photoCount}, 6–10 words each
- closing: single sentence`;
  }

  return ko
    ? `${header}
- title: 8자 이내 감성 제목
- subtitle: 20자 이내
- period: ${period ? `"${period}" 그대로` : "추정 가능한 짧은 기간 또는 빈 문자열"}
- location: ${location ? `"${location}" 그대로` : "도시 정도 또는 빈 문자열"}
- intro: 5~8문장, 디테일 풍부
- captions: 정확히 ${photoCount}개, 40~60자
- closing: 따뜻한 2~3문장`
    : `${header}
- title: short evocative title
- subtitle: one line
- period/location: as above
- intro: 5–8 sentences, detail-rich
- captions: exactly ${photoCount}, 12–20 words
- closing: warm 2–3 sentences`;
}
