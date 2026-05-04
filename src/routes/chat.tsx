import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, Send, Sparkles, X, MapPin, Calendar } from "lucide-react";
import { saveAlbum } from "@/lib/storage";
import { toast } from "sonner";
import { useT, getLang } from "@/lib/i18n";
import type { PhotoMeta } from "@/lib/photoMeta";

export const Route = createFileRoute("/chat")({
  component: Chat,
  head: () => ({ meta: [{ title: "Chat — Memori" }] }),
});

type Msg = { role: "user" | "assistant"; content: string };

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;
const ALBUM_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-album`;
const READY_TOKEN = "[READY_TO_FINISH]";

const AFFIRMATIVE_EN = /\b(yes|yeah|yep|sure|ok|okay|sounds good|let'?s|please do|go ahead|finish|done|wrap|that'?s (it|all)|i'?m done)\b/i;
const AFFIRMATIVE_KO = /(네|예|좋아|좋아요|응|그래|그래요|끝|완성|마무리|충분|괜찮|해주세요|해줘|부탁)/;

function isAffirmative(text: string) {
  return AFFIRMATIVE_EN.test(text) || AFFIRMATIVE_KO.test(text);
}

const WRAP_HINT_EN = /(weave (these|them|it) into|wrap (this|it) up|finish (the|your) album|create the album now|put (this|these) together)/i;
const WRAP_HINT_KO = /(앨범으로 정리|앨범을 정리|마무리해|마무리할까|정리해드려|정리해 드려|정리할까|완성해드려|완성해 드려|완성할까)/;
function isWrapProposal(text: string | undefined) {
  if (!text) return false;
  if (text.includes(READY_TOKEN)) return true;
  return WRAP_HINT_EN.test(text) || WRAP_HINT_KO.test(text);
}

function fmtTakenAt(iso: string | undefined, lang: string) {
  if (!iso) return undefined;
  try {
    const d = new Date(iso);
    return d.toLocaleString(lang === "ko" ? "ko-KR" : undefined, {
      year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch { return undefined; }
}

function Chat() {
  const { t, lang } = useT();
  const navigate = useNavigate();
  const [photos, setPhotos] = useState<string[]>([]);
  const [photoMetas, setPhotoMetas] = useState<PhotoMeta[]>([]);
  const [meta, setMeta] = useState<{ period?: string; location?: string }>({});
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [previewIdx, setPreviewIdx] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const finishingRef = useRef(false);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const stickToBottomRef = useRef(true);

  function isNearBottom() {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  function scrollToLatest(behavior: ScrollBehavior = "smooth") {
    const el = scrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior });
    });
  }

  useEffect(() => {
    const raw = sessionStorage.getItem("memori_photos");
    if (!raw) { navigate({ to: "/create" }); return; }
    const ph: string[] = JSON.parse(raw);
    setPhotos(ph);
    try { setMeta(JSON.parse(sessionStorage.getItem("memori_meta") || "{}")); } catch {}
    try { setPhotoMetas(JSON.parse(sessionStorage.getItem("memori_photo_metas") || "[]")); } catch {}
    const opener = getLang() === "ko" ? "이 사진들 좀 봐줘." : "Take a look at these photos with me.";
    void send(opener, ph, []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    scrollToLatest(busy ? "auto" : "smooth");
  }, [messages, busy]);

  useEffect(() => {
    if (!busy && !generating) return;
    inputRef.current?.blur();
    const timer = window.setTimeout(() => scrollToLatest("auto"), 120);
    return () => window.clearTimeout(timer);
  }, [busy, generating]);

  // Keep latest message pinned just above the input when the on-screen keyboard
  // opens/closes (visualViewport changes height) or when the input gains focus.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => scrollToLatest("auto");
    vv.addEventListener("resize", onResize);
    return () => vv.removeEventListener("resize", onResize);
  }, []);

  function handleInputFocus() {
    // Wait a beat for the keyboard to animate in, then pin the latest message.
    window.setTimeout(() => scrollToLatest("smooth"), 250);
  }

  async function send(text: string, ph = photos, prior = messages) {
    const userMsg: Msg = { role: "user", content: text };
    const newMsgs = [...prior, userMsg];
    setMessages(newMsgs);
    setBusy(true);

    // detect: user is responding to a wrap-up suggestion
    const lastAssistant = [...prior].reverse().find(m => m.role === "assistant");
    const wrapProposed = isWrapProposal(lastAssistant?.content);
    const userAgreed = wrapProposed && isAffirmative(text);

    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: newMsgs,
          photos: prior.length === 0 ? ph : undefined,
          lang: getLang(),
        }),
      });

      if (resp.status === 429) { toast.error(t.rateLimit); setBusy(false); return; }
      if (resp.status === 402) { toast.error(t.aiQuota); setBusy(false); return; }
      if (!resp.ok || !resp.body) throw new Error("stream failed");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let assistant = "";
      setMessages(m => [...m, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) !== -1) {
          let line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const j = line.slice(6).trim();
          if (j === "[DONE]") break;
          try {
            const p = JSON.parse(j);
            const c = p.choices?.[0]?.delta?.content;
            if (c) {
              assistant += c;
              setMessages(m => m.map((x, i) => i === m.length - 1 ? { ...x, content: assistant } : x));
            }
          } catch {
            buf = line + "\n" + buf;
            break;
          }
        }
      }

      // After response: if user agreed to wrap, auto-finish
      if (userAgreed && !finishingRef.current) {
        finishingRef.current = true;
        // small delay so user sees the closing message
        setTimeout(() => { void finish(); }, 600);
      }
    } catch {
      toast.error(t.connectionError);
    } finally { setBusy(false); }
  }

  async function onSend() {
    const v = input.trim();
    if (!v || busy) return;
    inputRef.current?.blur();
    setInput("");
    await send(v);
  }

  async function finish() {
    if (messages.length < 2) { toast.error(t.talkMore); finishingRef.current = false; return; }
    setGenerating(true);
    try {
      const resp = await fetch(ALBUM_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages,
          photoCount: photos.length,
          lang: getLang(),
          period: meta.period,
          location: meta.location,
        }),
      });
      if (!resp.ok) throw new Error();
      const album = await resp.json();
      const id = crypto.randomUUID();
      await saveAlbum({
        id,
        title: album.title,
        subtitle: album.subtitle,
        intro: album.intro,
        closing: album.closing,
        period: album.period || meta.period,
        location: album.location || meta.location,
        photos: photos.map((dataUrl, i) => ({ dataUrl, caption: album.captions?.[i] ?? "" })),
        createdAt: Date.now(),
      });
      sessionStorage.removeItem("memori_photos");
      sessionStorage.removeItem("memori_meta");
      sessionStorage.removeItem("memori_photo_metas");
      setMessages([]);
      toast.success(t.completed);
      // Mark as leaving so back-guard cleanup doesn't pop history.
      leavingRef.current = true;
      // Replace history so device back from album goes to Home, not to chat/create.
      window.history.replaceState({}, "", "/");
      navigate({ to: "/album/$id", params: { id } });
    } catch {
      toast.error(t.failed);
      setGenerating(false);
      finishingRef.current = false;
    }
  }

  // History stack juggling: each owner increments expectedPopsRef before
  // calling history.back() on cleanup, so the other listener can ignore that
  // pop instead of treating it as a user back-button press.
  const expectedPopsRef = useRef(0);
  const previewOpenRef = useRef(false);

  const previewOpen = previewIdx != null;
  useEffect(() => { previewOpenRef.current = previewOpen; }, [previewOpen]);

  useEffect(() => {
    if (!previewOpen) return;
    window.history.pushState({ memoriPreview: true }, "");
    const onPop = () => setPreviewIdx(null);
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (window.history.state?.memoriPreview) {
        expectedPopsRef.current++;
        window.history.back();
      }
    };
  }, [previewOpen]);

  const previewMeta = previewIdx != null ? photoMetas[previewIdx] : undefined;
  const previewWhen = fmtTakenAt(previewMeta?.takenAt, lang);
  const previewWhere = previewMeta?.city;
  const hasMeta = !!(previewWhen || previewWhere);

  const hasConversation = messages.some(m => m.role === "user");
  const [confirmLeave, setConfirmLeave] = useState(false);
  const leavingRef = useRef(false);

  function tryLeave(e?: React.MouseEvent) {
    if (hasConversation && !generating) {
      e?.preventDefault();
      setConfirmLeave(true);
    }
  }

  function doLeave() {
    sessionStorage.removeItem("memori_photos");
    sessionStorage.removeItem("memori_meta");
    sessionStorage.removeItem("memori_photo_metas");
    setConfirmLeave(false);
    leavingRef.current = true;
    navigate({ to: "/" });
  }

  // Device/browser back button guard. Stays active during preview too — the
  // preview entry sits on top of the guard entry in history.
  useEffect(() => {
    if (!hasConversation || generating) return;
    window.history.pushState({ memoriChatGuard: true }, "");
    const onPop = () => {
      if (leavingRef.current) return;
      // Pop consumed by another owner (e.g. preview cleanup): ignore.
      if (expectedPopsRef.current > 0) {
        expectedPopsRef.current--;
        return;
      }
      // Device back while preview is open: preview handles its own close.
      if (previewOpenRef.current) return;
      window.history.pushState({ memoriChatGuard: true }, "");
      setConfirmLeave(true);
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (window.history.state?.memoriChatGuard && !leavingRef.current) {
        expectedPopsRef.current++;
        window.history.back();
      }
    };
  }, [hasConversation, generating]);

  return (
    <div className="mx-auto max-w-md min-h-screen flex flex-col">
      <div className="sticky top-0 z-30 bg-background/85 backdrop-blur-md border-b border-border/40">
        <header className="flex items-center justify-between px-5 pt-6 pb-3">
          <Link to="/create" onClick={tryLeave} className="p-2 -ml-2 text-foreground/70"><ArrowLeft size={20}/></Link>
          <div className="text-xs text-muted-foreground">{t.chatPhotos(photos.length)}</div>
          <button
            onClick={finish}
            disabled={generating || busy}
            className="text-xs flex items-center gap-1 px-3 py-1.5 rounded-full bg-primary text-primary-foreground disabled:opacity-50"
          >
            <Sparkles size={12}/> {generating ? t.creating : t.finish}
          </button>
        </header>

        <div className="px-5 pb-3 flex gap-1.5 overflow-x-auto">
          {photos.map((p, i) => (
            <button
              key={i}
              onClick={() => setPreviewIdx(i)}
              className="relative flex-shrink-0 active:scale-95 transition-transform"
              aria-label={t.photoOf(i + 1)}
            >
              <img src={p} alt="" className="w-12 h-12 object-cover rounded-md" />
              <span className="absolute top-0.5 left-0.5 bg-primary text-primary-foreground text-[10px] font-bold rounded-full w-[18px] h-[18px] flex items-center justify-center ring-1 ring-background shadow-sm">{i+1}</span>
            </button>
          ))}
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 pb-20 space-y-3">
        {messages.filter((_, i) => i > 0 || messages[0]?.role === "assistant").map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
              m.role === "user"
                ? "bg-primary text-primary-foreground rounded-br-sm"
                : "glass text-foreground rounded-bl-sm border border-border/50"
            }`}>
              {(m.content || "...").replaceAll(READY_TOKEN, "").trim() || "..."}
            </div>
          </div>
        ))}
        {busy && messages[messages.length - 1]?.role === "user" && (
          <div className="flex justify-start"><div className="glass px-4 py-2.5 rounded-2xl text-sm border border-border/50">...</div></div>
        )}
        <div ref={bottomRef} aria-hidden="true" className="h-px" />
      </div>

      <div className="sticky bottom-0 px-4 pb-5 pt-2 bg-gradient-to-t from-background to-transparent">
        <div className="flex gap-2 items-center glass rounded-full px-2 py-1.5 border border-border/50">
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onFocus={handleInputFocus}
            onKeyDown={e => e.key === "Enter" && onSend()}
            placeholder={t.inputPlaceholder}
            disabled={busy}
            className="flex-1 bg-transparent px-3 py-2 outline-none text-sm"
          />
          <button onClick={onSend} disabled={busy || !input.trim()}
            className="p-2.5 rounded-full bg-primary text-primary-foreground disabled:opacity-40">
            <Send size={16}/>
          </button>
        </div>
      </div>

      {previewIdx != null && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setPreviewIdx(null)}
        >
          <div
            className="relative max-w-md w-full bg-card rounded-2xl overflow-hidden shadow-[var(--shadow-warm)]"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => { (e.currentTarget as any)._tx = e.touches[0].clientX; }}
            onTouchEnd={(e) => {
              const sx = (e.currentTarget as any)._tx as number | undefined;
              if (sx == null) return;
              const dx = e.changedTouches[0].clientX - sx;
              if (Math.abs(dx) < 40) return;
              if (dx < 0 && previewIdx < photos.length - 1) setPreviewIdx(previewIdx + 1);
              else if (dx > 0 && previewIdx > 0) setPreviewIdx(previewIdx - 1);
            }}
          >
            <button
              onClick={() => setPreviewIdx(null)}
              className="absolute top-2 right-2 z-10 bg-background/80 backdrop-blur rounded-full p-2 text-foreground/70"
              aria-label={t.close}
            ><X size={16} /></button>
            {previewIdx > 0 && (
              <button
                onClick={() => setPreviewIdx(previewIdx - 1)}
                className="absolute left-2 top-1/2 -translate-y-1/2 z-10 bg-background/80 backdrop-blur rounded-full p-2 text-foreground/70"
                aria-label="prev"
              >‹</button>
            )}
            {previewIdx < photos.length - 1 && (
              <button
                onClick={() => setPreviewIdx(previewIdx + 1)}
                className="absolute right-2 top-1/2 -translate-y-1/2 z-10 bg-background/80 backdrop-blur rounded-full p-2 text-foreground/70"
                aria-label="next"
              >›</button>
            )}
            <img
              src={photos[previewIdx]}
              alt={t.photoOf(previewIdx + 1)}
              className="w-full max-h-[70vh] object-contain bg-black/5"
            />
            <div className="px-5 py-4 text-[13px] warm-text">
              <div className="flex items-center justify-between mb-2">
                <div className="font-display text-base">{t.photoOf(previewIdx + 1)}</div>
                <div className="text-[11px] warm-muted">{previewIdx + 1} / {photos.length}</div>
              </div>
              {hasMeta ? (
                <div className="space-y-1.5 warm-muted">
                  {previewWhen && (
                    <div className="flex items-center gap-2"><Calendar size={13}/> <span>{t.when}: {previewWhen}</span></div>
                  )}
                  {previewWhere && (
                    <div className="flex items-center gap-2"><MapPin size={13}/> <span>{t.where}: {previewWhere}</span></div>
                  )}
                </div>
              ) : (
                <div className="warm-muted italic">{t.noMeta}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {confirmLeave && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-5" onClick={() => setConfirmLeave(false)}>
          <div className="bg-card rounded-2xl max-w-sm w-full p-5 shadow-[var(--shadow-warm)]" onClick={e => e.stopPropagation()}>
            <div className="font-display text-lg mb-1.5">{t.leaveTitle}</div>
            <div className="text-sm warm-muted mb-5 leading-relaxed">{t.leaveDesc}</div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmLeave(false)} className="px-4 py-2 text-sm rounded-full border border-border/60">{t.keepGoing}</button>
              <button onClick={doLeave} className="px-4 py-2 text-sm rounded-full bg-destructive text-destructive-foreground">{t.leaveConfirm}</button>
            </div>
          </div>
        </div>
      )}

      {generating && (
        <div className="fixed inset-0 z-[60] bg-background/85 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center">
          <div className="relative mb-5">
            <div className="w-14 h-14 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
            <Sparkles size={20} className="absolute inset-0 m-auto text-primary" />
          </div>
          <div className="font-display text-lg mb-1.5">{t.weaving}</div>
          <div className="text-sm warm-muted max-w-xs leading-relaxed">{t.weavingDesc}</div>
        </div>
      )}
    </div>
  );
}
