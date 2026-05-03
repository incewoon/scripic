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
    <div className="mx-auto max-w-md min-h-screen px-5 pt-12 pb-32">
      <header className="mb-10 text-center">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-card/60 px-3 py-1 text-xs text-muted-foreground mb-4 border border-border/50">
          <BookHeart size={12} className="text-primary" /> 모든 데이터는 기기에만 저장돼요
        </div>
        <h1 className="text-4xl font-display text-foreground mb-2">memori</h1>
        <p className="text-sm text-muted-foreground">사진 한 장에 담긴 그날의 이야기</p>
      </header>

      <div className="mb-6 flex items-baseline justify-between px-1">
        <h2 className="text-sm font-medium text-foreground/80">내 앨범</h2>
        <span className="text-xs text-muted-foreground">{count} / {FREE_LIMIT}</span>
      </div>

      {albums === null ? (
        <div className="text-center text-sm text-muted-foreground py-20">불러오는 중...</div>
      ) : albums.length === 0 ? (
        <button onClick={onCreate} className="w-full polaroid rotate-[-2deg] hover:rotate-0 transition-transform py-16 text-center">
          <div className="text-5xl mb-3">📷</div>
          <div className="font-display text-lg text-foreground">첫 추억을 남겨보세요</div>
          <div className="text-xs text-muted-foreground mt-1">사진 5~10장이면 충분해요</div>
        </button>
      ) : (
        <div className="space-y-5">
          {albums.map((a, i) => (
            <div key={a.id} className={`polaroid ${i % 2 === 0 ? "rotate-[-1deg]" : "rotate-[1deg]"}`}>
              <Link to="/album/$id" params={{ id: a.id }} className="block">
                <div className="aspect-[4/3] rounded-sm overflow-hidden bg-muted relative">
                  <img src={a.photos[0]?.dataUrl} alt={a.title} className="w-full h-full object-cover" loading="lazy" />
                </div>
                <div className="mt-3 px-1">
                  <div className="font-display text-lg text-foreground leading-tight">{a.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{a.subtitle} · {a.photos.length}장</div>
                </div>
              </Link>
              <button
                onClick={(e) => { e.preventDefault(); if (confirm("이 앨범을 삭제할까요?")) onDelete(a.id); }}
                className="absolute mt-2 ml-1 text-muted-foreground/60 hover:text-destructive text-xs flex items-center gap-1"
              >
                <Trash2 size={11} /> 삭제
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="fixed bottom-6 left-0 right-0 px-5 mx-auto max-w-md">
        <button
          onClick={onCreate}
          disabled={reached}
          className="w-full glass border border-primary/30 text-foreground rounded-full py-4 font-medium flex items-center justify-center gap-2 shadow-[var(--shadow-soft)] disabled:opacity-60"
          style={{ background: reached ? undefined : "var(--gradient-warm)" }}
        >
          {reached ? <><Lock size={16}/> 무료 한도에 도달했어요</> : <><Plus size={18}/> 새 앨범 만들기</>}
        </button>
      </div>
    </div>
  );
}
