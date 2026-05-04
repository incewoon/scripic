import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Send, Sparkles } from "lucide-react";
import { saveAlbum } from "@/lib/storage";
import { toast } from "sonner";
import { useT, getLang } from "@/lib/i18n";

export const Route = createFileRoute("/chat")({
  component: Chat,
  head: () => ({ meta: [{ title: "Chat — Memori" }] }),
});

type Msg = { role: "user" | "assistant"; content: string };

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;
const ALBUM_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-album`;

function Chat() {
  const { t } = useT();
  const navigate = useNavigate();
  const [photos, setPhotos] = useState<string[]>([]);
  const [meta, setMeta] = useState<{ period?: string; location?: string }>({});
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem("memori_photos");
    if (!raw) { navigate({ to: "/create" }); return; }
    const ph: string[] = JSON.parse(raw);
    setPhotos(ph);
    try { setMeta(JSON.parse(sessionStorage.getItem("memori_meta") || "{}")); } catch {}
    const opener = getLang() === "ko" ? "이 사진들 좀 봐줘." : "Take a look at these photos with me.";
    void send(opener, ph, []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function send(text: string, ph = photos, prior = messages) {
    const userMsg: Msg = { role: "user", content: text };
    const newMsgs = [...prior, userMsg];
    setMessages(newMsgs);
    setBusy(true);

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
    } catch {
      toast.error(t.connectionError);
    } finally { setBusy(false); }
  }

  async function onSend() {
    const v = input.trim();
    if (!v || busy) return;
    setInput("");
    await send(v);
  }

  async function finish() {
    if (messages.length < 2) { toast.error(t.talkMore); return; }
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
      setMessages([]);
      toast.success(t.completed);
      navigate({ to: "/album/$id", params: { id } });
    } catch {
      toast.error(t.failed);
      setGenerating(false);
    }
  }

  return (
    <div className="mx-auto max-w-md min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-5 pt-6 pb-3">
        <Link to="/create" className="p-2 -ml-2 text-foreground/70"><ArrowLeft size={20}/></Link>
        <div className="text-xs text-muted-foreground">{t.chatPhotos(photos.length)}</div>
        <button
          onClick={finish}
          disabled={generating || busy}
          className="text-xs flex items-center gap-1 px-3 py-1.5 rounded-full bg-primary text-primary-foreground disabled:opacity-50"
        >
          <Sparkles size={12}/> {generating ? t.creating : t.finish}
        </button>
      </header>

      <div className="px-5 mb-3 flex gap-1.5 overflow-x-auto">
        {photos.map((p, i) => (
          <div key={i} className="relative flex-shrink-0">
            <img src={p} alt="" className="w-12 h-12 object-cover rounded-md" />
            <span className="absolute -top-1 -left-1 bg-primary text-primary-foreground text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">{i+1}</span>
          </div>
        ))}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 pb-4 space-y-3">
        {messages.filter((_, i) => i > 0 || messages[0]?.role === "assistant").map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
              m.role === "user"
                ? "bg-primary text-primary-foreground rounded-br-sm"
                : "glass text-foreground rounded-bl-sm border border-border/50"
            }`}>
              {m.content || "..."}
            </div>
          </div>
        ))}
        {busy && messages[messages.length - 1]?.role === "user" && (
          <div className="flex justify-start"><div className="glass px-4 py-2.5 rounded-2xl text-sm border border-border/50">...</div></div>
        )}
      </div>

      <div className="sticky bottom-0 px-4 pb-5 pt-2 bg-gradient-to-t from-background to-transparent">
        <div className="flex gap-2 items-center glass rounded-full px-2 py-1.5 border border-border/50">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
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
    </div>
  );
}
