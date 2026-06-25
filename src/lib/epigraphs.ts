export const EPIGRAPHS_KO: string[] = [
  "기억은 기록될 때 더 오래 머뭅니다.",
  "사진은 순간을 담고, 이야기는 삶을 남깁니다.",
  "사진에 담기지 않은 기억까지.",
  "모든 사진 뒤에는 이야기가 있습니다.",
  "오늘의 평범함이 내일의 추억이 됩니다.",
  "잊기 전에 남겨두세요.",
  "한 장의 사진이 기억의 문을 엽니다.",
  "삶은 순간으로 이루어지고, 기억은 이야기로 남습니다.",
  "당신의 하루를 이야기로 남겨보세요.",
  "기억은 생각보다 빨리 흐려집니다.",
  "사진은 시작일 뿐입니다.",
  "당신만 알고 있는 이야기를 남겨보세요.",
  "평범한 하루도 기록할 가치가 있습니다.",
  "기억은 쌓이고, 삶의 기록이 됩니다.",
  "지금 이 순간도 언젠가 그리워질지 모릅니다.",
  "오늘을 미래의 나에게 선물하세요.",
  "사진보다 오래 남는 것은 이야기입니다.",
  "당신의 삶은 기록할 가치가 있습니다.",
  "모든 기억은 사소한 순간에서 시작됩니다.",
  "기록은 기억을 붙잡아 둡니다.",
  "추억은 우연히 남지 않습니다.",
  "시간은 지나가지만 이야기는 남습니다.",
  "사진 속 그날을 다시 만나보세요.",
  "기억을 모으면 인생이 보입니다.",
  "당신의 이야기를 잊지 마세요.",
  "사라지는 순간을 붙잡아 두세요.",
  "사진이 묻고, 기억이 답합니다.",
  "가장 소중한 기록은 당신의 이야기입니다.",
  "지금의 일상이 미래의 보물이 됩니다.",
  "기억은 돌아오지만, 기록은 남습니다.",
  "삶의 흔적을 남겨보세요.",
  "잊혀질 순간에 이름을 붙여주세요.",
  "오늘도 하나의 이야기가 만들어지고 있습니다.",
  "사진은 기억을 깨우는 열쇠입니다.",
  "언젠가 다시 읽을 오늘의 이야기.",
  "당신이 기억하는 방식으로 남겨보세요.",
  "모든 인생은 한 권의 책입니다.",
  "사진 한 장은 한 편의 이야기입니다.",
  "당신의 기억은 당신만의 역사입니다.",
  "추억은 기록될 때 더욱 선명해집니다.",
  "잊고 싶지 않은 오늘을 남기세요.",
  "삶의 조각들을 모아보세요.",
  "당신의 이야기는 계속됩니다.",
  "오늘의 한 장면이 미래의 미소가 됩니다.",
  "사진은 기억을 불러오고, 이야기는 감정을 남깁니다.",
  "과거의 나와 미래의 나를 이어주세요.",
  "평범한 순간은 생각보다 소중합니다.",
  "기억을 기록하는 것은 자신을 이해하는 일입니다.",
  "당신의 삶을 한 페이지씩 써 내려가세요.",
  "모든 이야기는 기억될 가치가 있습니다.",
];

export const EPIGRAPHS_EN: string[] = [
  "Memories stay longer when they're recorded.",
  "Photos capture moments, stories preserve lives.",
  "Beyond what's captured in the photo.",
  "Every photo has a story behind it.",
  "Today's ordinary moments become tomorrow's memories.",
  "Capture it before it fades.",
  "A single photo opens the door to memory.",
  "Life is made of moments, memories live as stories.",
  "Turn your day into a story.",
  "Memories fade faster than we think.",
  "A photo is only the beginning.",
  "Preserve the story only you can tell.",
  "Even ordinary days deserve to be remembered.",
  "Memories accumulate into the story of your life.",
  "One day, you may miss this very moment.",
  "Give today's memories to your future self.",
  "Stories outlast photographs.",
  "Your life is worth preserving.",
  "Every memory begins with a small moment.",
  "Recording helps memories stay.",
  "Memories don't preserve themselves.",
  "Time passes, stories remain.",
  "Reconnect with the day behind the photo.",
  "Collect memories, discover a life.",
  "Don't lose your story.",
  "Hold on to fleeting moments.",
  "Photos ask, memories answer.",
  "Your story is your most valuable record.",
  "Today's routine becomes tomorrow's treasure.",
  "Memories return, records remain.",
  "Leave traces of your journey.",
  "Give forgotten moments a name.",
  "Another story is being written today.",
  "Photos are keys that awaken memories.",
  "Today's story, for another day.",
  "Preserve it in your own words.",
  "Every life is a book.",
  "Every photo is a story waiting to be told.",
  "Your memories are your personal history.",
  "Memories become clearer when recorded.",
  "Preserve the day you don't want to forget.",
  "Gather the pieces of your life.",
  "Your story continues.",
  "Today's scene becomes tomorrow's smile.",
  "Photos recall memories, stories preserve emotions.",
  "Connect your past self with your future self.",
  "Ordinary moments are more precious than they seem.",
  "Recording memories is understanding yourself.",
  "Write your life one page at a time.",
  "Every story deserves to be remembered.",
];

export function pickEpigraph(lang: "ko" | "en"): string {
  const list = lang === "ko" ? EPIGRAPHS_KO : EPIGRAPHS_EN;
  if (list.length === 0) return "";
  if (list.length === 1) return list[0];
  const key = `scripic_last_epigraph_idx_${lang}`;
  let lastIdx = -1;
  try {
    const v = typeof sessionStorage !== "undefined" ? sessionStorage.getItem(key) : null;
    if (v !== null) lastIdx = Number(v);
  } catch {}
  let idx = Math.floor(Math.random() * list.length);
  let guard = 0;
  while (idx === lastIdx && guard < 5) {
    idx = Math.floor(Math.random() * list.length);
    guard++;
  }
  try {
    if (typeof sessionStorage !== "undefined") sessionStorage.setItem(key, String(idx));
  } catch {}
  return list[idx];
}
