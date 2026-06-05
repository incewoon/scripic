"use client";

import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, Send, Sparkles, X, MapPin, Calendar } from "lucide-react";
import { saveAlbum } from "@/lib/storage";
import { toast } from "sonner";
import { useT, getLang, type ChatMode, type ChatTone } from "@/lib/i18n";
import type { PhotoMeta } from "@/lib/photoMeta";
import { aiChatStream, aiGenerateAlbum } from "@/lib/aiClient";
import { markAlbumCreatedToday } from "@/lib/dailyLimit";
import { useAuthReady } from "@/lib/useAuthReady";

export const ssr = false;
export const csr = true;

export const Route = createFileRoute("/chat")({
  component: Chat,
  ssr: false,
  head: () => ({ meta: [{ title: "Chat — Scripic" }] }),
});

type Msg = { role: "user" | "assistant"; content: string };

const READY_TOKEN = "[READY_TO_FINISH]";
const PROPOSE_TOKEN = "[PROPOSE_FINISH]";
const TOKEN_RE = /\[(READY_TO_FINISH|PROPOSE_FINISH)\]/g;

// 전체 대화(사용자+AI) 최대 메시지 수. 도달 시 강제 마무리.
const MAX_TOTAL_MESSAGES = 12;

function sanitizeForDisplay(text: string) {
  return text.replace(TOKEN_RE, "").trim();
}

const AFFIRMATIVE_EN =
  /\b(yes|yeah|yep|yup|sure|ok|okay|sounds good|let'?s|go ahead|finish|done|wrap|that'?s (it|all)|i'?m done)\b/i;
const AFFIRMATIVE_KO =
  /(네|넹|넵|넴|예|응|웅|어|그래(요)?|좋아(요)?|ㅇㅇ|ㅇㅋ|오케이|콜|끝|완성|마무리|충분|됐어|그래그래)/;

function isAffirmative(text: string) {
  return AFFIRMATIVE_EN.test(text) || AFFIRMATIVE_KO.test(text);
}

const WRAP_HINT_EN =
  /(weave (these|them|it) into|wrap (this|it) up|finish (the|your) album|create the album now|put (this|these) together|shall i (put|wrap|finish))/i;
const WRAP_HINT_KO =
  /(앨범으로 (정리|마무리)|이대로 (정리|마무리)|정리할까요|마무리할까요|완성할까요|정리해 ?드릴까요|마무리해 ?드릴까요|완성해 ?드릴까요)/;
function isWrapProposal(text: string | undefined) {
  if (!text) return false;
  if (text.includes(PROPOSE_TOKEN) || text.includes(READY_TOKEN)) return true;
  return WRAP_HINT_EN.test(text) || WRAP_HINT_KO.test(text);
}

// User explicitly asks to finalize.
const EXPLICIT_FINISH_KO =
  /((앨범|이걸|이거|이제)\s*)?(마무리|정리|완성|마감|끝내)(\s*(해|해줘|해주세요|해주실|할래|할까|하자|부탁|좀)|$)/;
const EXPLICIT_FINISH_EN =
  /\b(finish (it|this|the album)|wrap (it|this) up|wrap up|finalize|complete (it|the album)|put (it|this|them|these) together|create the album|make the album)\b/i;
function isExplicitFinishRequest(text: string) {
  return EXPLICIT_FINISH_KO.test(text) || EXPLICIT_FINISH_EN.test(text);
}

function fmtTakenAt(iso: string | undefined, lang: string) {
  if (!iso) return undefined;
  try {
    const d = new Date(iso);
    return d.toLocaleString(lang === "ko" ? "ko-KR" : undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return undefined;
  }
}

// Smaller, lower-quality variant for the AI payload. Display + saved album
// keep the original 1280px versions. Cuts the first-turn upload by ~50-60%.
async function downscaleForAi(dataUrl: string, maxDim = 896, q = 0.75): Promise<string> {
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = dataUrl;
    });
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    if (scale >= 1) return dataUrl;
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", q);
  } catch {
    return dataUrl;
  }
}

function Chat() {
  const { t, lang } = useT();
  const navigate = useNavigate();
  const { ready: authReady, user } = useAuthReady();
  const [photos, setPhotos] = useState<string[]>([]);
  const [photoMetas, setPhotoMetas] = useState<PhotoMeta[]>([]);
  const [meta, setMeta] = useState<{ period?: string; location?: string }>({});
  const [mode] = useState<ChatMode>(() => {
    if (typeof sessionStorage === "undefined") return "creative";
    const m = sessionStorage.getItem("memori_mode");
    return m === "fact" || m === "brief" ? m : "creative";
  });
  const [tone] = useState<ChatTone>(() => {
    if (typeof sessionStorage === "undefined") return "politely";
    const t = sessionStorage.getItem("memori_tone");
    return t === "friendly" || t === "short" ? t : "politely";
  });
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [previewIdx, setPreviewIdx] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const finishingRef = useRef(false);
  const autoStartedRef = useRef(false);
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
    if (!authReady || !user || autoStartedRef.current) return;
    autoStartedRef.current = true;
    const raw = sessionStorage.getItem("memori_photos");
    if (!raw) {
      navigate({ to: "/create" });
      return;
    }
    const ph: string[] = JSON.parse(raw);
    setPhotos(ph);
    try {
      setMeta(JSON.parse(sessionStorage.getItem("memori_meta") || "{}"));
    } catch {}
    try {
      setPhotoMetas(JSON.parse(sessionStorage.getItem("memori_photo_metas") || "[]"));
    } catch {}
    const opener = getLang() === "ko" ? "이 사진들 좀 봐줘." : "Take a look at these photos with me.";
    // Build smaller AI-payload variants in parallel; first send uses them.
    void (async () => {
      const aiPhotos = await Promise.all(ph.map((p) => downscaleForAi(p)));
      void send(opener, ph, [], aiPhotos);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, navigate, user]);

  // Track scroll position so we don't yank the user away if they're reading.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      stickToBottomRef.current = isNearBottom();
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // Auto-pin to latest while assistant streams or user just sent a message.
  useLayoutEffect(() => {
    if (busy || stickToBottomRef.current) {
      scrollToLatest(busy ? "auto" : "smooth");
    }
  }, [messages, busy]);

  useEffect(() => {
    if (!busy && !generating) return;
    inputRef.current?.blur();
    const timer = window.setTimeout(() => scrollToLatest("auto"), 120);
    return () => window.clearTimeout(timer);
  }, [busy, generating]);

  // Track keyboard via visualViewport. Inset = how much the keyboard covers
  // the layout viewport. We translate the input up by that amount so it
  // always sits just above the keyboard, and re-pin the latest message.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKeyboardInset(inset);
      if (stickToBottomRef.current) scrollToLatest("auto");
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  function handleInputFocus() {
    stickToBottomRef.current = true;
    // Re-pin after the keyboard animation settles.
    window.setTimeout(() => scrollToLatest("smooth"), 300);
  }

  async function send(text: string, ph = photos, prior = messages, aiPhotos?: string[]) {
    if (!authReady || !user) {
      toast.error(t.connectionError);
      return;
    }

    const userMsg: Msg = { role: "user", content: text };
    const newMsgs = [...prior, userMsg];
    setMessages(newMsgs);
    setBusy(true);

    // detect: user is responding to a wrap-up suggestion, OR is explicitly asking to finalize now
    const lastAssistant = [...prior].reverse().find((m) => m.role === "assistant");
    const wrapProposed = isWrapProposal(lastAssistant?.content);
    const userExplicit = isExplicitFinishRequest(text);
    const userAgreed = userExplicit || (wrapProposed && isAffirmative(text));

    let assistant = "";
    let streamError: any = null;
    try {
      setMessages((m) => [...m, { role: "assistant", content: "" }]);

      const photosForCall = prior.length === 0 ? (aiPhotos ?? ph) : undefined;
      for await (const delta of aiChatStream({
        messages: newMsgs,
        photos: photosForCall,
        photoCount: ph.length,
        lang: getLang(),
        mode,
        maxTurnsPerPhoto: 3,
      })) {
        assistant += delta;
        setMessages((m) => m.map((x, i) => (i === m.length - 1 ? { ...x, content: assistant } : x)));
      }
    } catch (err: any) {
      streamError = err;
      const code = err?.code ?? "";
      const kind = err?.details?.kind;
      if (kind === "ai_unavailable" || code === "functions/unavailable") toast.error(t.aiBusy);
      else if (kind === "ai_quota") toast.error(t.aiQuota);
      else if (kind === "daily_limit") toast.error(t.dailyLimitBody);
      else if (code === "functions/resource-exhausted") toast.error(t.rateLimit);
      else if (code === "functions/unauthenticated" || code === "functions/permission-denied")
        toast.error(t.connectionError);
      else toast.error(t.connectionError);
    } finally {
      setBusy(false);
    }

    // 단일 트리거: 서버가 [READY_TO_FINISH]를 보낸 순간에만 finish() 호출.
    // 명시적 종료 명령은 서버가 [PROPOSE_FINISH]로 한 번 더 확인하므로 여기서 finish하지 않음.
    const aiReady = assistant.includes(READY_TOKEN);
    const aiProposed = assistant.includes(PROPOSE_TOKEN);

    const finalMsgs: Msg[] = assistant ? [...newMsgs, { role: "assistant", content: assistant }] : [...newMsgs];

    // 임시 디버그 로그
    console.log("[Chat] DEBUG", {
      aiReady,
      aiProposed,
      assistantLast100: assistant.slice(-100),
      finalMsgCount: finalMsgs.length,
    });

    console.log("[Chat] finish check", {
      userExplicit,
      userAgreed,
      wrapProposed,
      aiReady,
      totalMessages: finalMsgs.length,
      streamError: !!streamError,
    });

    if (aiReady && !finishingRef.current && !leavingRef.current && !streamError) {
      finishingRef.current = true;
      // 사용자가 마지막 "정리해드릴게요" 문구를 읽을 시간을 준 뒤 앨범 생성으로 이동.
      setBusy(true);
      setTimeout(() => {
        void finish(finalMsgs);
      }, 2000);
      return;
    }

    // 하드 캡: 전체 메시지가 MAX_TOTAL_MESSAGES 이상이면 사용자 응답을 기다리지 않고 강제 마무리.
    if (
      !aiReady &&
      !finishingRef.current &&
      !leavingRef.current &&
      !streamError &&
      finalMsgs.length >= MAX_TOTAL_MESSAGES
    ) {
      finishingRef.current = true;
      const closingMsg: Msg = {
        role: "assistant",
        content: getLang() === "ko" ? "이제 앨범으로 정리해드릴게요." : "Let me put this together as your album now.",
      };
      const withClosing = [...finalMsgs, closingMsg];
      setMessages(withClosing);
      console.log("[Chat] hard cap reached, force finishing in 2s", { messageCount: withClosing.length });
      setTimeout(() => {
        void finish(withClosing);
      }, 2000);
    }
  }

  async function onSend() {
    const v = input.trim();
    if (!v || busy) return;
    inputRef.current?.blur();
    setInput("");
    await send(v);
  }

  async function finish(messagesOverride?: Msg[]) {
    const msgs = messagesOverride ?? messages;
    console.log("[Chat] finish() called", {
      override: !!messagesOverride,
      messageCount: msgs.length,
      generating,
      busy,
    });
    if (msgs.length < 2) {
      toast.error(t.talkMore);
      finishingRef.current = false;
      return;
    }
    setGenerating(true);
    try {
      console.log("[Chat] calling aiGenerateAlbum", { messageCount: msgs.length, photoCount: photos.length });
      const album = await aiGenerateAlbum({
        messages: msgs,
        photoCount: photos.length,
        lang: getLang(),
        period: meta.period,
        location: meta.location,
        mode,
        tone,
      });
      const id = crypto.randomUUID();
      markAlbumCreatedToday();
      await saveAlbum({
        id,
        title: album.title,
        subtitle: album.subtitle,
        intro: album.intro,
        closing: album.closing,
        period: meta.period || album.period,
        location: album.location || meta.location,
        photos: photos.map((dataUrl, i) => ({ dataUrl, caption: album.captions?.[i] ?? "" })),
        createdAt: Date.now(),
      });
      sessionStorage.removeItem("memori_photos");
      sessionStorage.removeItem("memori_meta");
      sessionStorage.removeItem("memori_photo_metas");
      sessionStorage.removeItem("memori_mode");
      sessionStorage.removeItem("memori_tone");
      setMessages([]);
      toast.success(t.completed);
      leavingRef.current = true;
      window.history.replaceState({}, "", "/");
      navigate({ to: "/album/$id", params: { id } });
    } catch (err: any) {
      const code = err?.code ?? "";
      const kind = err?.details?.kind;
      if (kind === "ai_quota") toast.error(t.aiQuota);
      else if (kind === "daily_limit") toast.error(t.dailyLimitBody);
      else if (code === "functions/resource-exhausted") toast.error(t.rateLimit);
      else toast.error(t.failed);
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
  useEffect(() => {
    previewOpenRef.current = previewOpen;
  }, [previewOpen]);

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

  const hasConversation = messages.some((m) => m.role === "user");
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
    sessionStorage.removeItem("memori_mode");
    sessionStorage.removeItem("memori_tone");
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
    <div className="mx-auto max-w-md flex flex-col h-[100dvh]" style={{ paddingBottom: keyboardInset }}>
      <div className="sticky top-0 z-30 bg-background/85 backdrop-blur-md border-b border-border/40">
        <header className="flex items-center justify-between px-5 pt-6 pb-3">
          <Link to="/create" onClick={tryLeave} className="p-2 -ml-2 text-foreground/70">
            <ArrowLeft size={20} />
          </Link>
          <div className="text-xs text-muted-foreground">{t.chatPhotos(photos.length)}</div>
          <button
            onClick={() => void finish()}
            disabled={generating || busy}
            className="text-xs flex items-center gap-1 px-3 py-1.5 rounded-full bg-primary text-primary-foreground disabled:opacity-50"
          >
            <Sparkles size={12} /> {generating ? t.creating : t.finish}
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
              <span className="absolute top-0.5 left-0.5 bg-primary text-primary-foreground text-[10px] font-bold rounded-full w-[18px] h-[18px] flex items-center justify-center ring-1 ring-background shadow-sm">
                {i + 1}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 pt-3 pb-3 space-y-3">
        {messages
          .filter((_, i) => i > 0 || messages[0]?.role === "assistant")
          .map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div
                className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                  m.role === "user"
                    ? "bg-primary text-primary-foreground rounded-br-sm"
                    : "glass text-foreground rounded-bl-sm border border-border/50"
                }`}
              >
                {sanitizeForDisplay(m.content || "...") || "..."}
              </div>
            </div>
          ))}
        {busy && messages[messages.length - 1]?.role === "user" && (
          <div className="flex justify-start">
            <div className="glass px-4 py-2.5 rounded-2xl text-sm border border-border/50">...</div>
          </div>
        )}
        <div ref={bottomRef} aria-hidden="true" className="h-px" />
      </div>

      <div className="px-4 pt-2 pb-[max(env(safe-area-inset-bottom),0.75rem)] bg-gradient-to-t from-background to-transparent">
        <div className="flex gap-2 items-center glass rounded-full px-2 py-1.5 border border-border/50">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={handleInputFocus}
            onKeyDown={(e) => e.key === "Enter" && onSend()}
            placeholder={t.inputPlaceholder}
            disabled={busy}
            className="flex-1 bg-transparent px-3 py-2 outline-none text-sm"
          />
          <button
            onClick={onSend}
            disabled={busy || !input.trim()}
            className="p-2.5 rounded-full bg-primary text-primary-foreground disabled:opacity-40"
          >
            <Send size={16} />
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
            onTouchStart={(e) => {
              (e.currentTarget as any)._tx = e.touches[0].clientX;
            }}
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
            >
              <X size={16} />
            </button>
            {previewIdx > 0 && (
              <button
                onClick={() => setPreviewIdx(previewIdx - 1)}
                className="absolute left-2 top-1/2 -translate-y-1/2 z-10 bg-background/80 backdrop-blur rounded-full p-2 text-foreground/70"
                aria-label="prev"
              >
                ‹
              </button>
            )}
            {previewIdx < photos.length - 1 && (
              <button
                onClick={() => setPreviewIdx(previewIdx + 1)}
                className="absolute right-2 top-1/2 -translate-y-1/2 z-10 bg-background/80 backdrop-blur rounded-full p-2 text-foreground/70"
                aria-label="next"
              >
                ›
              </button>
            )}
            <img
              src={photos[previewIdx]}
              alt={t.photoOf(previewIdx + 1)}
              className="w-full max-h-[70vh] object-contain bg-black/5"
            />
            <div className="px-5 py-4 text-[13px] warm-text">
              <div className="flex items-center justify-between mb-2">
                <div className="font-display text-base">{t.photoOf(previewIdx + 1)}</div>
                <div className="text-[11px] warm-muted">
                  {previewIdx + 1} / {photos.length}
                </div>
              </div>
              {hasMeta ? (
                <div className="space-y-1.5 warm-muted">
                  {previewWhen && (
                    <div className="flex items-center gap-2">
                      <Calendar size={13} />{" "}
                      <span>
                        {t.when}: {previewWhen}
                      </span>
                    </div>
                  )}
                  {previewWhere && (
                    <div className="flex items-center gap-2">
                      <MapPin size={13} />{" "}
                      <span>
                        {t.where}: {previewWhere}
                      </span>
                    </div>
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
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-5"
          onClick={() => setConfirmLeave(false)}
        >
          <div
            className="bg-card rounded-2xl max-w-sm w-full p-5 shadow-[var(--shadow-warm)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="font-display text-lg mb-1.5">{t.leaveTitle}</div>
            <div className="text-sm warm-muted mb-5 leading-relaxed">{t.leaveDesc}</div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmLeave(false)}
                className="px-4 py-2 text-sm rounded-full border border-border/60"
              >
                {t.keepGoing}
              </button>
              <button
                onClick={doLeave}
                className="px-4 py-2 text-sm rounded-full bg-destructive text-destructive-foreground"
              >
                {t.leaveConfirm}
              </button>
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
