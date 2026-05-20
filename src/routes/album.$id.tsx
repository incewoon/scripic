import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Trash2, Pencil, Check, X, MapPin, Calendar, Download } from "lucide-react";
import { toPng } from "html-to-image";
import { getAlbums, deleteAlbum, updateAlbum, subscribeAlbums, type Album } from "@/lib/storage";
import { useT } from "@/lib/i18n";
import { toast } from "sonner";

export const Route = createFileRoute("/album/$id")({
  component: AlbumView,
});

function EditableText({
  editKey, activeKey, setActiveKey, editingMode,
  value, onSave, multiline = false, className = "", placeholder = "",
}: {
  editKey: string;
  activeKey: string | null;
  setActiveKey: (k: string | null) => void;
  editingMode: boolean;
  value: string; onSave: (v: string) => void; multiline?: boolean; className?: string; placeholder?: string;
}) {
  const { t } = useT();
  const editing = editingMode && activeKey === editKey;
  const [draft, setDraft] = useState(value);
  useEffect(() => { if (editing) setDraft(value); }, [editing, value]);

  // Read-only mode: just plain text, no click affordance
  if (!editingMode) {
    return (
      <div className={className}>
        {value || <span className="warm-muted italic">{placeholder || "—"}</span>}
      </div>
    );
  }

  if (!editing) {
    return (
      <button
        onClick={() => setActiveKey(editKey)}
        className={`group relative text-left w-full ${className}`}
        aria-label={t.edit}
      >
        <span>{value || <span className="warm-muted italic">{placeholder || "—"}</span>}</span>
        <Pencil size={11} className="inline ml-1.5 opacity-60 warm-muted" />
      </button>
    );
  }

  const Tag: any = multiline ? "textarea" : "input";
  return (
    <div className="w-full">
      <Tag
        autoFocus
        value={draft}
        onChange={(e: any) => setDraft(e.target.value)}
        rows={multiline ? 5 : undefined}
        className={`w-full bg-card border border-border rounded-lg px-2.5 py-1.5 text-foreground outline-none focus:border-primary ${className}`}
      />
      <div className="flex gap-2 mt-2 justify-end">
        <button onClick={() => setActiveKey(null)} className="text-xs warm-muted px-2 py-1 flex items-center gap-1"><X size={12}/>{t.cancel}</button>
        <button onClick={() => { onSave(draft); setActiveKey(null); toast.success(t.saved); }} className="text-xs bg-primary text-primary-foreground rounded-full px-3 py-1 flex items-center gap-1"><Check size={12}/>{t.save}</button>
      </div>
    </div>
  );
}

function AlbumView() {
  const { id } = Route.useParams();
  const { t } = useT();
  const [album, setAlbum] = useState<Album | null | undefined>(undefined);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const shareRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    const reload = () => {
      getAlbums().then((list) => { if (!cancelled) setAlbum(list.find((a) => a.id === id) ?? null); });
    };
    reload();
    const unsub = subscribeAlbums(reload);
    return () => { cancelled = true; unsub(); };
  }, [id]);

  async function patch(p: Partial<Album>) {
    if (!album) return;
    const next = { ...album, ...p };
    setAlbum(next);
    await updateAlbum(album.id, p);
  }

  async function patchCaption(idx: number, value: string) {
    if (!album) return;
    const photos = album.photos.map((ph, i) => i === idx ? { ...ph, caption: value } : ph);
    await patch({ photos });
  }

  async function downloadImage() {
    if (!shareRef.current || !album) return;
    setDownloading(true);
    setActiveKey(null);
    try {
      await new Promise(r => setTimeout(r, 50));
      const dataUrl = await toPng(shareRef.current, {
        pixelRatio: 2,
        backgroundColor: "#fdf6f1",
        cacheBust: true,
      });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${(album.title || "memory-weaver").replace(/[^\w가-힣\- ]/g, "")}.png`;
      a.click();
      toast.success(t.downloaded);
    } catch {
      toast.error(t.failed);
    } finally {
      setDownloading(false);
    }
  }

  if (album === undefined) return <div className="p-10 text-center text-sm warm-muted">{t.loading}</div>;
  if (album === null) return (
    <div className="p-10 text-center">
      <p className="text-sm warm-muted mb-4">{t.notFound}</p>
      <Link to="/" className="text-primary text-sm">{t.home}</Link>
    </div>
  );

  const shareLink = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div className="mx-auto max-w-md min-h-screen pb-20">
      <header className="sticky top-0 z-10 glass flex items-center justify-between px-5 py-3 border-b border-border/40">
        <Link to="/" className="p-2 -ml-2 text-foreground/70"><ArrowLeft size={20}/></Link>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              const next = !editMode;
              setEditMode(next);
              if (!next) setActiveKey(null);
            }}
            className={`p-2 rounded-full transition-colors ${
              editMode ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground"
            }`}
            aria-label={t.edit}
            aria-pressed={editMode}
          ><Pencil size={18}/></button>
          <button
            onClick={async () => {
              if (confirm(t.confirmDelete)) {
                await deleteAlbum(album.id);
                navigate({ to: "/" });
              }
            }}
            className="p-2 text-muted-foreground hover:text-destructive"
            aria-label={t.delete}
          ><Trash2 size={18}/></button>
        </div>
      </header>

      <div ref={shareRef} className="bg-background">
        <div className="px-6 pt-10 pb-4 text-center">
          <EditableText
            editKey="title" activeKey={activeKey} setActiveKey={setActiveKey} editingMode={editMode}
            value={album.title}
            onSave={(v) => patch({ title: v })}
            className="font-display text-3xl text-foreground mb-2 text-center"
            placeholder={t.title}
          />
          <EditableText
            editKey="subtitle" activeKey={activeKey} setActiveKey={setActiveKey} editingMode={editMode}
            value={album.subtitle}
            onSave={(v) => patch({ subtitle: v })}
            className="text-sm warm-muted italic text-center"
            placeholder={t.subtitle}
          />

          <div className="mt-4 flex items-center justify-center gap-4 text-[12px] warm-muted">
            <div className="flex items-center gap-1.5">
              <Calendar size={12}/>
              <EditableText editKey="period" activeKey={activeKey} setActiveKey={setActiveKey} editingMode={editMode} value={album.period || ""} onSave={(v) => patch({ period: v })} placeholder={t.period} className="text-[12px]" />
            </div>
            <div className="flex items-center gap-1.5">
              <MapPin size={12}/>
              <EditableText editKey="location" activeKey={activeKey} setActiveKey={setActiveKey} editingMode={editMode} value={album.location || ""} onSave={(v) => patch({ location: v })} placeholder={t.place} className="text-[12px]" />
            </div>
          </div>
        </div>

        <div className="px-6 mb-8">
          <EditableText
            editKey="intro" activeKey={activeKey} setActiveKey={setActiveKey} editingMode={editMode}
            value={album.intro}
            onSave={(v) => patch({ intro: v })}
            multiline
            className="text-[15px] leading-relaxed text-foreground/85 font-display"
            placeholder={t.intro}
          />
        </div>

        <div className="space-y-8 px-5">
          {album.photos.map((p, i) => (
            <figure key={i} className={`polaroid ${i % 2 === 0 ? "rotate-[-1.5deg]" : "rotate-[1.5deg]"}`}>
              <img src={p.dataUrl} alt={p.caption} className="w-full aspect-[4/3] object-cover rounded-sm" loading="lazy" crossOrigin="anonymous" />
              <figcaption className="text-center font-display text-[15px] mt-3 text-foreground/80 px-2">
                <EditableText
                  editKey={`caption-${i}`} activeKey={activeKey} setActiveKey={setActiveKey} editingMode={editMode}
                  value={p.caption}
                  onSave={(v) => patchCaption(i, v)}
                  multiline
                  className="text-center font-display text-[15px]"
                  placeholder={t.caption}
                />
              </figcaption>
            </figure>
          ))}
        </div>

        <div className="px-6 mt-12 text-center">
          <EditableText
            editKey="closing" activeKey={activeKey} setActiveKey={setActiveKey} editingMode={editMode}
            value={album.closing}
            onSave={(v) => patch({ closing: v })}
            multiline
            className="text-[15px] leading-relaxed text-foreground/85 font-display italic text-center"
            placeholder={t.closing}
          />
          <p className="text-[10px] warm-muted mt-8">
            {new Date(album.createdAt).toLocaleDateString()} · {t.onlyOnDevice}
          </p>
        </div>

        {/* Watermark — visible in downloaded image */}
        <div className="mt-10 px-6 py-5 text-center border-t border-border/40">
          <div className="font-display text-base text-foreground/80">Scripic</div>
          <div className="text-[11px] warm-muted mt-1">{t.madeWith}</div>
          <div className="text-[11px] text-primary mt-1 break-all">{shareLink}</div>
        </div>
      </div>

      <div className="px-6 mt-6">
        <button
          onClick={downloadImage}
          disabled={downloading}
          className="w-full flex items-center justify-center gap-2 rounded-full py-3.5 text-[14px] text-primary-foreground shadow-[var(--shadow-warm)] disabled:opacity-60 active:scale-[0.98] transition-transform"
          style={{ background: "var(--gradient-warm)" }}
        >
          <Download size={16}/> {downloading ? t.preparing : t.download}
        </button>
      </div>
    </div>
  );
}
