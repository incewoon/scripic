## Goal

Replace every "Rementory" mention (UI strings, metadata, manifest, native app name, AI prompts) with **Scripic** (Script + Pic), and update the main-page tagline under the title to a new slogan built around the new name.

## New tagline (under "Scripic" on the home screen)

- EN: **"Every pic writes its own script."**
- KO: **"사진 한 장이 한 편의 스크립트가 돼요."**

If you'd prefer a different line (e.g. "Where every pic becomes a story", "한 컷, 한 편의 이야기"), tell me and I'll swap it in during implementation.

## Files to update

1. **`src/routes/index.tsx`**
   - L126: H1 `Rementory` → `Scripic`
   - L37: `<title>` → `Scripic — Capture the moments you never want to forget` (and reflect in any matching og/twitter meta if present)

2. **`src/lib/i18n.ts`** — replace `Rementory` → `Scripic` in both `en` and `ko` blocks:
   - L12 `appTagline` (en) → "Every pic writes its own script."
   - L188 `appTagline` (ko) → "사진 한 장이 한 편의 스크립트가 돼요."
   - L67, L90, L91, L105, L123, L140, L159 (en strings)
   - L243, L281, L299, L316, L335 (ko strings)

3. **`src/routes/__root.tsx`** L36/39/44 — `title`, `og:title`, `twitter:title` → `Scripic`

4. **Per-route page titles** — replace `— Rementory` with `— Scripic`:
   - `src/routes/chat.tsx` L13
   - `src/routes/create.tsx` L33
   - `src/routes/easter.tsx` L9, plus L84 body copy ("— a little secret from Scripic")
   - `src/routes/settings.tsx` L16
   - `src/routes/album.$id.tsx` L239 footer brand label

5. **`public/manifest.json`** L2/L3 — `name` and `short_name` → Scripic

6. **`capacitor.config.ts`** L5 — `appName: "Scripic"` (native Android/iOS app display name)

7. **`src/lib/reviewReward.functions.ts`** — replace all "Rementory" mentions in the system prompt (L4, L5, L16, L25, L26, L33, L35, L37, L55, L56) so the review-verification AI looks for "Scripic" in user screenshots.

## Not touched (intentionally)

- **Package/bundle identifier** in `capacitor.config.ts` (`appId`) — changing it would break installed app upgrades. Leave as-is unless you say otherwise.
- **`appId` / Firebase config / Supabase project names** — internal IDs, no user-facing impact.
- **Git history, repo name, `package.json` `"name"` field** — not user-visible; leaving untouched unless you ask.

## Verification after implementation

- `grep -ri "rementory"` returns 0 hits in source.
- Home screen shows "Scripic" + new tagline (both EN and KO browser locales).
- Browser tab title, PWA install prompt, and native app launcher all say "Scripic".
