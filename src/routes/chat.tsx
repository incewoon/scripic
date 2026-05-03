import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Send, Sparkles } from "lucide-react";
import { saveAlbum } from "@/lib/storage";
import { toast } from "sonner";

export const Route = createFileRoute("/chat")({
  component: Chat,
  head: () => ({ meta: [{ title: "AI와 대화하기 — Memori" }] }),
});

type Msg = { role: "user" | "assistant"; content: string };

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;
const ALBUM_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-album`;

function Chat() {
  const navigate = useNavigate();
  const [photos, setPhotos] = useState<string[]>([]);
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
    // kick off opening message
    void send("이 사진들 좀 봐줘.", ph, []);
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
        }),
      });

      if (resp.status === 429) { toast.error("요청이 너무 많아요. 잠시 후 다시 시도해주세요."); setBusy(false); return; }
      if (resp.status === 402) { toast.error("AI 사용량이 한도에 도달했어요."); setBusy(false); return; }
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
    } catch (e) {
      toast.error("연결에 문제가 생겼어요");
    } finally { setBusy(false); }
  }

  async function onSend() {
    const t = input.trim();
    if (!t || busy) return;
    setInput("");
    await send(t);
  }

  async function finish() {
    if (messages.length < 2) { toast.error("조금 더 이야기를 나눠보세요"); return; }
    setGenerating(true);
    try {
      const resp = await fetch(ALBUM_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages, photoCount: photos.length }),
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
        photos: photos.map((dataUrl, i) => ({ dataUrl, caption: album.captions?.[i] ?? "" })),
        createdAt: Date.now(),
      });
      sessionStorage.removeItem("memori_photos");
      // 서버 측 대화는 stateless라 별도 삭제 호출 불필요. 클라이언트 메시지도 정리.
      setMessages([]);
      toast.success("앨범이 완성됐어요 ✨ 대화 기록은 모두 삭제되었어요");
      navigate({ to: "/album/$id", params: { id } });
    } catch {
      toast.error("앨범 생성에 실패했어요");
      setGenerating(false);
    }
  }

  return (
    <div className="mx-auto max-w-md min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-5 pt-6 pb-3">
        <Link to="/create" className="p-2 -ml-2 text-foreground/70"><ArrowLeft size={20}/></Link>
        <div className="text-xs text-muted-foreground">사진 {photos.length}장</div>
        <button
          onClick={finish}
          disabled={generating || busy}
          className="text-xs flex items-center gap-1 px-3 py-1.5 rounded-full bg-primary text-primary-foreground disabled:opacity-50"
        >
          <Sparkles size={12}/> {generating ? "만드는 중..." : "완성하기"}
        </button>
      </header>

      <div className="px-5 mb-3 flex gap-1.5 overflow-x-auto">
        {photos.map((p, i) => (
          <img key={i} src={p} alt="" className="w-12 h-12 object-cover rounded-md flex-shrink-0" />
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
            placeholder="이야기를 들려주세요..."
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
