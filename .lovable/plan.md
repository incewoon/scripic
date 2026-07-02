
## 수정된 방침

- 서버 프롬프트는 **기본값을 두지 않음**. 알 수 없는 `mode`/`tone`이 오면 즉시 에러.
- 앱 최초 실행 시 create.tsx 화면 셋팅 기본값만 **journal + politely**로. 이후는 사용자가 마지막으로 고른 값을 유지(현재 동작 그대로).
- Journal 프롬프트에 "AI 발화는 사실로 취급하지 말 것" 지침 추가.

## 변경 사항

### 1. `functions/src/index.ts` — 알 수 없는 값은 에러
두 지점(L150·195 chat, L379·416 generateAlbum):

- 파라미터 기본값 `mode = "story"`, `tone = "politely"` 제거 → 그냥 `mode`, `tone`으로 받음.
- 유효성 체크로 대체:
  ```ts
  if (mode !== "story" && mode !== "journal" && mode !== "summary") {
    throw new HttpsError("invalid-argument", `invalid mode: ${String(mode)}`);
  }
  if (tone !== "politely" && tone !== "friendly" && tone !== "short") {
    throw new HttpsError("invalid-argument", `invalid tone: ${String(tone)}`);
  }
  ```
- 기존 `const m: AlbumMode = mode === ... ? mode : "story"` 폴백 코드 제거.

### 2. `functions/src/prompts-album.ts` — 명시적 switch + Journal 강화
- `albumSystem`과 `modeSpec`의 `if/if/return story` 구조를 `switch (mode)`로 바꾸고, `default:`는 `throw new Error(`unknown mode: ${mode}`)`. 서버에서 이미 검증하므로 실제로는 도달 안 하지만, 프롬프트 층에서도 조용한 폴백을 금지.
- Journal 시스템 프롬프트에 추가:
  - "대화 기록에는 `User:`와 `AI:` 두 발화자가 있습니다. **`User:` 줄만 사실로 취급**하고, `AI:` 줄에 등장한 감성적 묘사·비유·풍경 표현은 사용자 발화가 아니므로 결과물에 옮기지 마세요."
  - "사용자가 직접 말하지 않은 감정어(설렘·벅찬·아련한 등)·비유·의성어를 추가하지 마세요."
- Summary도 같은 "`User:` 줄만 사실" 문구 추가(재발 방지).
- Story 브랜치는 유지.

### 3. `src/routes/create.tsx` — 최초 실행 기본값을 politely로
- L129 `loadDefault(TONE_KEY, VALID_TONES, "friendly")` → `"politely"`로 변경.
- mode 기본값은 이미 `"journal"` (L128) — 그대로 둠.
- 사용자가 이전에 다른 값을 선택했다면 localStorage에 저장되어 있으므로 그 값이 그대로 유지됨(loadDefault 로직).

### 4. 손대지 않음
- `supabase/functions/_shared/prompts-album.ts` (미사용 레거시)
- `src/routes/chat.tsx`의 legacy 마이그레이션(`fact`→`journal` 등) — 방어 코드로 남겨둠.
- 프론트에서 mode/tone을 서버로 보내는 부분 — 현재 항상 유효값이므로 수정 불필요.

## 검증
- 빌드 통과 확인.
- Journal 모드로 앨범 생성 시 결과에서 감성 표현/허구가 줄어드는지 사용자 재현으로 확인.

## 파일
- `functions/src/index.ts`
- `functions/src/prompts-album.ts`
- `src/routes/create.tsx`
