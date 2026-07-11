Replace the static "..." placeholders in `src/routes/chat.tsx` with an animated typing indicator.

### What to change
- In `src/routes/chat.tsx`:
  - Add a tiny inline component `TypingIndicator` near the top of the file (beside other helpers). It renders three dots inside a glass, rounded-2xl assistant bubble with staggered `animate-bounce`:
    - Outer wrapper: `glass rounded-2xl px-4 py-2.5 border border-border/50` (same as assistant bubble).
    - Three dots in a row, each `w-1.5 h-1.5 rounded-full bg-muted-foreground` with `animate-bounce` and `animation-delay-75` / `animation-delay-150` / `animation-delay-225` (or Tailwind `delay-75`/`delay-150`/`delay-200` if available). Use small gap between dots.
    - Add `aria-label="Typing"` / `role="status"` for accessibility.
  - In the `messages.map()` rendering block:
    - When `m.role === "assistant" && sanitizeForDisplay(m.content) === ""`, render `<TypingIndicator />` instead of the current fallback `"..."`.
    - Keep the existing bubble style, max-width, rounded corners, and text classes for non-empty content.
  - In the separate `busy && messages[messages.length - 1]?.role === "user"` placeholder block:
    - Replace the static `...` bubble with `<TypingIndicator />` and preserve the same glass + rounded-2xl wrapper.
  - Verify the `generating` overlay already has its own spinner and is untouched.

### Why this approach
- The indicator is self-contained, uses only Tailwind defaults, and matches the existing assistant bubble visual language.
- It covers both code paths the user mentioned: (1) the empty assistant bubble that appears during streaming, and (2) the busy placeholder shown while the user message is being processed.
- It preserves the existing glass/rounded-2xl styling without changing the theme.

### Test after implementation
- Run `bun run build` to ensure no TypeScript errors or class-name issues.
- Open the chat preview and trigger a streaming response: verify the three dots animate vertically and the glass bubble remains styled correctly.