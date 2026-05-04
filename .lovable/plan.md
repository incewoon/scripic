## Goal

Let users pick the AI conversation style on the photo-picking screen (`/create`) before chatting. Three modes:

- **Creative** (default, current behavior) — warm, evocative, infers feelings, weaves rich prose.
- **Fact** — asks only matter-of-fact questions about what is objectively visible in the photo. Album output preserves the conversation as-is (no embellishment, minimal summarization).
- **Brief** — asks short, simple questions and produces a brief, summarized album.

## UI changes (`src/routes/create.tsx`)

Add a mode selector right above the photo grid (under the info card, above the progress bar):

- A small section labeled "대화 모드 / Chat mode".
- Three pill buttons in a row: `Creative`, `Fact`, `Brief`.
- Selected pill uses the warm primary gradient styling already used on the main CTA; unselected pills use `border border-border/60` muted style.
- Below the pills, a one-line `text-[12px] warm-muted` description of the currently selected mode.
- `Creative` is selected by default.

State: `const [mode, setMode] = useState<ChatMode>("creative")`.

In `next()`, persist the choice to `sessionStorage.setItem("memori_mode", mode)` alongside the existing photo/meta keys.

## Wiring through to chat (`src/routes/chat.tsx`)

- Read mode from sessionStorage on mount: `const [mode] = useState<ChatMode>(() => (sessionStorage.getItem("memori_mode") as ChatMode) || "creative")`.
- Include `mode` in the request body to both `/functions/v1/chat` and `/functions/v1/generate-album`.
- Clear `memori_mode` in the same places the other `memori_*` session keys are cleared (after finish, on leave).

## i18n (`src/lib/i18n.ts`)

Add strings for both languages:

- `chatMode`: "Chat mode" / "대화 모드"
- `modeCreative`, `modeFact`, `modeBrief`: labels
- `modeCreativeDesc`: warm, story-rich conversation (current default).
- `modeFactDesc`: only asks about what's objectively visible; keeps the conversation verbatim in the album.
- `modeBriefDesc`: short, simple questions and a brief album summary.

## Edge function: chat (`supabase/functions/chat/index.ts`)

- Accept optional `mode` field on the request body (`"creative" | "fact" | "brief"`, default `"creative"`).
- Refactor `systemPrompt(lang, photoCount)` → `systemPrompt(lang, photoCount, mode)` and branch per mode for both ko and en.
  - `creative`: existing prompt unchanged.
  - `fact`: instruct the model to ask only about objectively observable details in the photo (people present, objects, setting, time of day, weather visible, actions). No emotional inference, no embellishment. Still walks photos one by one and uses the same `[READY_TO_FINISH]` wrap-up token.
  - `brief`: ask one short question per photo, max ~1 sentence per turn, move on quickly. Same wrap-up token.

## Edge function: generate-album (`supabase/functions/generate-album/index.ts`)

- Accept optional `mode` field; default `"creative"`.
- Refactor `systemFor(lang)` → `systemFor(lang, mode)` and `userPrompt(...)` to take `mode`.
  - `creative`: current rich prose behavior.
  - `fact`: system instruction = "Do NOT embellish or add feelings. Use only what was stated in the conversation. Preserve the user's wording where possible; do not summarize away facts." User prompt asks for a longer `intro` that is essentially the conversation organized into prose with no invented detail, captions that quote/paraphrase only what the user said about that photo, and a neutral 1–2 sentence closing.
  - `brief`: system instruction = "Be concise. Summarize tightly." User prompt requests shorter intro (2–3 sentences), short captions (~6–10 words / 15자 내외), and a 1-sentence closing.

The JSON schema returned by the tool call stays the same — only prompt text changes.

## Technical notes

- Define `type ChatMode = "creative" | "fact" | "brief"` in a small shared place. Simplest: declare in `src/lib/i18n.ts` (already imported by both routes) or inline in each route — pick inline to avoid touching i18n's shape.
- Edge functions deploy automatically.
- No database changes; mode is per-session only.
