import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getAlbums, deleteAlbum, FREE_LIMIT, type Album } from "@/lib/storage";
import { Plus, BookHeart, Trash2, Lock } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  component: Home,
  head: () => ({
    meta: [
      { title: "Memori — 사진으로 기억을 이야기하다" },
      { name: "description", content: "사진과 AI 대화로 만드는 나만의 추억 앨범. 기기에만 저장되는 비밀 일기." },
      { name: "theme-color", content: "#f5b9b0" },
    ],
    links: [
      { rel: "manifest", href: "/manifest.json" },
      { rel: "apple-touch-icon", href: "/icon-192.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&family=Nanum+Myeongjo:wght@400;700&display=swap" },
    ],
  }),
});

function Home() {
  const [albums, setAlbums] = useState<Album[] | null>(null);
  const navigate = useNavigate();

  useEffect(() => { getAlbums().then(setAlbums); }, []);

  const onCreate = () => {
    if ((albums?.length ?? 0) >= FREE_LIMIT) {
      toast.error("무료 플랜은 최대 2개까지 보관할 수 있어요", {
        description: "기존 앨범을 삭제하거나 곧 출시될 프리미엄을 기다려주세요 🤍",
      });
      return;
    }
    navigate({ to: "/create" });
  };

  const onDelete = async (id: string) => {
    await deleteAlbum(id);
    setAlbums(await getAlbums());
    toast.success("앨범을 삭제했어요");
  };

  const count = albums?.length ?? 0;
  const reached = count >= FREE_LIMIT;

  return (
    <div className="mx-auto max-w-md min-h-screen px-5 pt-14 pb-32">
      <header className="mb-10 text-center">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-card/70 px-3.5 py-1.5 text-[11px] warm-muted mb-5 border border-border/60 shadow-[var(--shadow-soft)]">
          <BookHeart size={12} className="text-primary" /> 모든 데이터는 이 기기에만 저장돼요
        </div>
        <h1 className="text-[44px] font-display warm-text mb-2 leading-none">memori</h1>
        <p className="text-[14px] warm-muted">사진 한 장에 담긴 그날의 이야기</p>
      </header>

      <div className="mb-5 flex items-baseline justify-between px-1">
        <h2 className="text-[15px] font-medium warm-text">내 앨범</h2>
        <span className="text-[11px] warm-muted">{count} / {FREE_LIMIT}</span>
      </div>

      {albums === null ? (
        <div className="text-center text-sm warm-muted py-20">불러오는 중...</div>
      ) : albums.length === 0 ? (
        <button onClick={onCreate} className="w-full polaroid rotate-[-2deg] hover:rotate-0 transition-transform py-16 text-center">
          <div className="text-5xl mb-3">📷</div>
          <div className="font-display text-lg warm-text">첫 추억을 남겨보세요</div>
          <div className="text-xs warm-muted mt-1.5">사진 5~10장이면 충분해요</div>
        </button>
      ) : (
        <div className="space-y-5">
          {albums.map((a) => {
            const date = new Date(a.createdAt).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
            return (
              <div key={a.id} className="album-card group">
                <Link to="/album/$id" params={{ id: a.id }} className="block">
                  <div className="aspect-[5/4] bg-muted relative overflow-hidden">
                    <img src={a.photos[0]?.dataUrl} alt={a.title} className="w-full h-full object-cover" loading="lazy" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
                    <div className="absolute top-3 right-3 flex gap-1">
                      {a.photos.slice(1, 4).map((p, idx) => (
                        <div key={idx} className="w-9 h-9 rounded-md overflow-hidden border-2 border-white/80 shadow-md">
                          <img src={p.dataUrl} alt="" className="w-full h-full object-cover" />
                        </div>
                      ))}
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 p-4 text-white">
                      <div className="text-[10px] uppercase tracking-[0.15em] opacity-80 mb-1">{date}</div>
                      <div className="font-display text-[20px] leading-tight drop-shadow-sm">{a.title}</div>
                      <div className="text-[12px] opacity-90 mt-1 italic font-display">{a.subtitle}</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="text-[12px] warm-muted">사진 {a.photos.length}장</span>
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (confirm("이 앨범을 삭제할까요?")) onDelete(a.id); }}
                      className="text-muted-foreground/70 hover:text-destructive text-[12px] flex items-center gap-1 px-2 py-1 -mr-2 rounded-md"
                    >
                      <Trash2 size={12} /> 삭제
                    </button>
                  </div>
                </Link>
              </div>
            );
          })}
        </div>
      )}

      <div className="fixed bottom-6 left-0 right-0 px-5 mx-auto max-w-md">
        <button
          onClick={onCreate}
          disabled={reached}
          className="w-full text-primary-foreground rounded-full py-4 text-[15px] font-medium flex items-center justify-center gap-2 shadow-[var(--shadow-warm)] disabled:opacity-60 active:scale-[0.98] transition-transform"
          style={{ background: reached ? "var(--muted)" : "var(--gradient-warm)" }}
        >
          {reached ? <><Lock size={16}/> 무료 한도에 도달했어요</> : <><Plus size={18}/> 새 앨범 만들기</>}
        </button>
      </div>
    </div>
  );
}
