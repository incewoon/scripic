import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Trash2 } from "lucide-react";
import { getAlbums, deleteAlbum, type Album } from "@/lib/storage";

export const Route = createFileRoute("/album/$id")({
  component: AlbumView,
});

function AlbumView() {
  const { id } = Route.useParams();
  const [album, setAlbum] = useState<Album | null | undefined>(undefined);
  const navigate = useNavigate();

  useEffect(() => {
    getAlbums().then(list => setAlbum(list.find(a => a.id === id) ?? null));
  }, [id]);

  if (album === undefined) return <div className="p-10 text-center text-sm text-muted-foreground">불러오는 중...</div>;
  if (album === null) return (
    <div className="p-10 text-center">
      <p className="text-sm text-muted-foreground mb-4">앨범을 찾을 수 없어요</p>
      <Link to="/" className="text-primary text-sm">홈으로</Link>
    </div>
  );

  return (
    <div className="mx-auto max-w-md min-h-screen pb-20">
      <header className="sticky top-0 z-10 glass flex items-center justify-between px-5 py-3 border-b border-border/40">
        <Link to="/" className="p-2 -ml-2 text-foreground/70"><ArrowLeft size={20}/></Link>
        <button
          onClick={async () => {
            if (confirm("이 앨범을 삭제할까요?")) {
              await deleteAlbum(album.id);
              navigate({ to: "/" });
            }
          }}
          className="p-2 text-muted-foreground hover:text-destructive"
        ><Trash2 size={18}/></button>
      </header>

      <div className="px-6 pt-10 pb-8 text-center">
        <h1 className="font-display text-3xl text-foreground mb-2">{album.title}</h1>
        <p className="text-sm text-muted-foreground italic">{album.subtitle}</p>
      </div>

      <div className="px-6 mb-8">
        <p className="text-[15px] leading-relaxed text-foreground/85 font-display">{album.intro}</p>
      </div>

      <div className="space-y-8 px-5">
        {album.photos.map((p, i) => (
          <figure key={i} className={`polaroid ${i % 2 === 0 ? "rotate-[-1.5deg]" : "rotate-[1.5deg]"}`}>
            <img src={p.dataUrl} alt={p.caption} className="w-full aspect-[4/3] object-cover rounded-sm" loading="lazy" />
            <figcaption className="text-center font-display text-[15px] mt-3 text-foreground/80">{p.caption}</figcaption>
          </figure>
        ))}
      </div>

      <div className="px-6 mt-12 text-center">
        <p className="text-[15px] leading-relaxed text-foreground/85 font-display italic">— {album.closing}</p>
        <p className="text-[10px] text-muted-foreground mt-8">
          {new Date(album.createdAt).toLocaleDateString("ko-KR")} · 이 기기에만 저장됨
        </p>
      </div>
    </div>
  );
}
