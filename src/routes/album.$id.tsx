import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Trash2, Pencil, Check, X, MapPin, Calendar as CalendarIcon, Download, Tag, Plus } from "lucide-react";
import { toPng } from "html-to-image";
import { getAlbums, deleteAlbum, updateAlbum, subscribeAlbums, getLastSavedCoords, type Album } from "@/lib/storage";
import { useT } from "@/lib/i18n";
import { toast } from "sonner";
import { Hl } from "@/lib/highlight";
import { MapDialog } from "@/components/MapDialog";
import { EditCoachmark, shouldShowEditCoach } from "@/components/EditCoachmark";
import { TagPickerDialog } from "@/components/TagPickerDialog";
import { useOnlineStatus, requireOnline } from "@/lib/network";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import type { DateRange } from "react-day-picker";

export const Route = createFileRoute("/album/$id")({
  component: AlbumView,
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    q: typeof s.q === "string" ? s.q : "",
    tags: Array.isArray(s.tags)
      ? (s.tags as unknown[]).filter((x): x is string => typeof x === "string")
      : typeof s.tags === "string" && s.tags
        ? [s.tags]
        : [],
  }),
});

function EditableText({
  editKey,
  activeKey,
  setActiveKey,
  editingMode,
  value,
  onSave,
  multiline = false,
  className = "",
  placeholder = "",
  highlightQuery = "",
}: {
  editKey: string;
  activeKey: string | null;
  setActiveKey: (k: string | null) => void;
  editingMode: boolean;
  value: string;
  onSave: (v: string) => void;
  multiline?: boolean;
  className?: string;
  placeholder?: string;
  highlightQuery?: string;
}) {
  const { t } = useT();
  const editing = editingMode && activeKey === editKey;
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    if (editing) setDraft(value);
  }, [editing, value]);

  // Read-only mode: just plain text, no click affordance
  if (!editingMode) {
    return (
      <div className={className}>
        {value ? (
          <Hl text={value} query={highlightQuery} />
        ) : (
          <span className="warm-muted italic">{placeholder || "—"}</span>
        )}
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
        <button onClick={() => setActiveKey(null)} className="text-xs warm-muted px-2 py-1 flex items-center gap-1">
          <X size={12} />
          {t.cancel}
        </button>
        <button
          onClick={() => {
            onSave(draft);
            setActiveKey(null);
            toast.success(t.saved);
          }}
          className="text-xs bg-primary text-primary-foreground rounded-full px-3 py-1 flex items-center gap-1"
        >
          <Check size={12} />
          {t.save}
        </button>
      </div>
    </div>
  );
}

// ----- Period (date range) picker --------------------------------------------

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function fmtDate(d: Date) {
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}
function formatPeriod(range: DateRange | undefined): string {
  if (!range?.from) return "";
  const from = range.from;
  const to = range.to ?? range.from;
  if (from.toDateString() === to.toDateString()) return fmtDate(from);
  if (from.getFullYear() === to.getFullYear() && from.getMonth() === to.getMonth()) {
    return `${fmtDate(from)}~${pad(to.getDate())}`;
  }
  return `${fmtDate(from)}~${fmtDate(to)}`;
}
function parsePeriod(s: string): DateRange | undefined {
  if (!s) return undefined;
  const mkDate = (y: number, m: number, d: number) => {
    const dt = new Date(y, m - 1, d);
    return isNaN(dt.getTime()) ? undefined : dt;
  };
  const full = s.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})(?:~(?:(\d{4})\.(\d{1,2})\.)?(\d{1,2}))?$/);
  if (!full) return undefined;
  const from = mkDate(+full[1], +full[2], +full[3]);
  if (!from) return undefined;
  if (!full[6]) return { from };
  const toY = full[4] ? +full[4] : +full[1];
  const toM = full[5] ? +full[5] : +full[2];
  const to = mkDate(toY, toM, +full[6]);
  return { from, to };
}

function PeriodPicker({
  value,
  onSave,
  placeholder,
  labelClear,
  labelSave,
  labelCancel,
  labelTitle,
}: {
  value: string;
  onSave: (v: string) => void;
  placeholder: string;
  labelClear: string;
  labelSave: string;
  labelCancel: string;
  labelTitle: string;
}) {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<DateRange | undefined>(() => parsePeriod(value));
  useEffect(() => {
    if (open) setRange(parsePeriod(value));
  }, [open, value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="group relative text-left text-[12px] inline-flex items-center gap-1"
          aria-label={labelTitle}
        >
          <span>{value || <span className="warm-muted italic">{placeholder}</span>}</span>
          <Pencil size={11} className="opacity-60 warm-muted" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="center">
        <div className="p-3">
          <div className="text-xs warm-muted mb-2 px-1">{labelTitle}</div>
          <Calendar
            mode="range"
            selected={range}
            onSelect={setRange}
            numberOfMonths={1}
            initialFocus
            className={cn("p-0 pointer-events-auto")}
          />
          <div className="flex items-center justify-between gap-2 mt-3 pt-2 border-t border-border/40">
            <button
              type="button"
              onClick={() => {
                setRange(undefined);
                onSave("");
                setOpen(false);
                toast.success(labelSave);
              }}
              className="text-xs warm-muted px-2 py-1"
            >
              {labelClear}
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-xs warm-muted px-2 py-1 flex items-center gap-1"
              >
                <X size={12} />
                {labelCancel}
              </button>
              <button
                type="button"
                onClick={() => {
                  onSave(formatPeriod(range));
                  setOpen(false);
                  toast.success(labelSave);
                }}
                className="text-xs bg-primary text-primary-foreground rounded-full px-3 py-1 flex items-center gap-1"
              >
                <Check size={12} />
                {labelSave}
              </button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}



function AlbumView() {
  const { id } = Route.useParams();
  const { q, tags: searchTags } = Route.useSearch();
  const { t } = useT();
  const [album, setAlbum] = useState<Album | null | undefined>(undefined);
  const online = useOnlineStatus();
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [mapMode, setMapMode] = useState<"view" | "pick">("view");
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const shareRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    const reload = () => {
      getAlbums().then((list) => {
        if (!cancelled) setAlbum(list.find((a) => a.id === id) ?? null);
      });
    };
    reload();
    const unsub = subscribeAlbums(reload);
    return () => {
      cancelled = true;
      unsub();
    };
  }, [id]);

  // Remember the last-saved coords across albums so the pick map opens
  // somewhere sensible instead of dropping the user in the middle of the ocean.
  const [lastCoords, setLastCoords] = useState<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    getLastSavedCoords().then((c) => {
      if (!cancelled) setLastCoords(c);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // First-time edit coachmark: shown once right after album creation.
  const [coachOpen, setCoachOpen] = useState(false);
  const pencilBtnRef = useRef<HTMLButtonElement>(null);
  const locationChipRef = useRef<HTMLButtonElement>(null);
  const downloadRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!album) return;
    if (!shouldShowEditCoach()) return;
    // Wait a tick for targets to mount + render.
    const tm = window.setTimeout(() => setCoachOpen(true), 350);
    return () => window.clearTimeout(tm);
  }, [album]);

  async function patch(p: Partial<Album>) {
    if (!album) return;
    const next = { ...album, ...p };
    setAlbum(next);
    await updateAlbum(album.id, p);
  }

  async function patchCaption(idx: number, value: string) {
    if (!album) return;
    const photos = album.photos.map((ph, i) => (i === idx ? { ...ph, caption: value } : ph));
    await patch({ photos });
  }

  async function downloadImage() {
    if (!shareRef.current || !album) return;
    setDownloading(true);
    setActiveKey(null);
    try {
      await new Promise((r) => setTimeout(r, 50));
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
  if (album === null)
    return (
      <div className="p-10 text-center">
        <p className="text-sm warm-muted mb-4">{t.notFound}</p>
        <Link to="/" className="text-primary text-sm">
          {t.home}
        </Link>
      </div>
    );

  return (
    <div className="mx-auto max-w-md pb-[max(env(safe-area-inset-bottom),0.75rem)]">
      <header className="sticky top-0 z-10 glass flex items-center justify-between px-5 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-3 border-b border-border/40">

        <Link to="/" search={{ q, tags: searchTags }} className="p-2 -ml-2 text-foreground/70">
          <ArrowLeft size={20} />
        </Link>
        <div className="flex items-center gap-1">
          <button
            ref={pencilBtnRef}
            type="button"
            disabled={!online}
            title={!online ? t.offlineNotice : undefined}
            onClick={() => {
              if (!requireOnline(t.offlineNotice)) return;
              const next = !editMode;
              setEditMode(next);
              if (!next) setActiveKey(null);
            }}
            className={`p-2 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              editMode ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground"
            }`}
            aria-label={t.edit}
            aria-pressed={editMode}
          >
            <Pencil size={18} />
          </button>
          <button
            onClick={async () => {
              if (confirm(t.confirmDelete)) {
                await deleteAlbum(album.id);
                navigate({ to: "/" });
              }
            }}
            className="p-2 text-muted-foreground hover:text-destructive"
            aria-label={t.delete}
          >
            <Trash2 size={18} />
          </button>
        </div>
      </header>

      <div ref={shareRef} className="bg-background">
        <div className="px-6 pt-10 pb-4 text-center">
          <EditableText
            editKey="title"
            activeKey={activeKey}
            setActiveKey={setActiveKey}
            editingMode={editMode}
            value={album.title}
            onSave={(v) => patch({ title: v })}
            className="font-display text-3xl text-foreground mb-2 text-center"
            placeholder={t.title}
            highlightQuery={q}
          />
          <EditableText
            editKey="subtitle"
            activeKey={activeKey}
            setActiveKey={setActiveKey}
            editingMode={editMode}
            value={album.subtitle}
            onSave={(v) => patch({ subtitle: v })}
            className="text-sm warm-muted italic text-center"
            placeholder={t.subtitle}
            highlightQuery={q}
          />

          <div className="mt-4 flex items-center justify-center gap-4 text-[12px] warm-muted">
            <div className="flex items-center gap-1.5">
              <CalendarIcon size={12} />
              {editMode ? (
                <PeriodPicker
                  value={album.period || ""}
                  onSave={(v) => patch({ period: v })}
                  placeholder={t.period}
                  labelClear={t.clear}
                  labelSave={t.save}
                  labelCancel={t.cancel}
                  labelTitle={t.pickPeriodTitle}
                />
              ) : (
                <div className="text-[12px]">
                  {album.period ? (
                    <Hl text={album.period} query={q} />
                  ) : (
                    <span className="warm-muted italic">{t.period}</span>
                  )}
                </div>
              )}
            </div>
            {album.location || (album.lat != null && album.lng != null) ? (
              <div className="flex items-center gap-1">
                <button
                  ref={locationChipRef}
                  type="button"
                  onClick={() => {
                    setMapMode(editMode ? "pick" : "view");
                    setMapOpen(true);
                  }}
                  className="flex items-center gap-1.5 text-[12px] text-primary hover:underline active:opacity-80"
                  aria-label={t.openGoogleMaps}
                >
                  <MapPin size={12} />
                  {album.location ? <Hl text={album.location} query={q} /> : <span>{t.openGoogleMaps}</span>}
                </button>
                {editMode && (
                  <button
                    type="button"
                    onClick={() => {
                      void patch({ location: "", lat: undefined, lng: undefined });
                      toast.success(t.saved);
                    }}
                    aria-label={t.removeLocation}
                    className="p-0.5 text-muted-foreground hover:text-destructive active:scale-95 transition-transform"
                  >
                    <X size={12} strokeWidth={2.5} />
                  </button>
                )}
              </div>
            ) : (
              <button
                ref={locationChipRef}
                type="button"
                onClick={() => {
                  setMapMode("pick");
                  setMapOpen(true);
                }}
                className="flex items-center gap-1.5 text-[12px] text-primary hover:underline active:opacity-80"
                aria-label={t.addLocation}
              >
                <Plus size={12} />
                <span>{t.addLocation}</span>
              </button>
            )}
          </div>
          {editMode ? (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              {(album.tags ?? []).map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => patch({ tags: (album.tags ?? []).filter((x) => x !== tag) })}
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] text-primary-foreground shadow-sm transition-transform active:scale-95"
                  style={{ background: "var(--gradient-warm)" }}
                  aria-label={`${t.delete} #${tag}`}
                >
                  <Tag size={10} />
                  {tag}
                  <X size={10} strokeWidth={2.5} className="opacity-90" />
                </button>
              ))}
              <button
                type="button"
                onClick={() => setTagPickerOpen(true)}
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] border border-dashed border-primary/50 text-primary bg-card/50 active:scale-95 transition-transform"
              >
                <Plus size={10} />
                {t.tagsLabel}
              </button>
            </div>
          ) : (
            album.tags && album.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                {album.tags.map((tag) => (
                  <Link
                    key={tag}
                    to="/"
                    search={{ q, tags: [tag] }}
                    className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] text-primary-foreground shadow-sm transition-transform active:scale-95"
                    style={{ background: "var(--gradient-warm)" }}
                  >
                    <Tag size={10} />
                    {tag}
                  </Link>
                ))}
              </div>
            )
          )}
        </div>

        <div className="px-6 mb-8">
          <EditableText
            editKey="intro"
            activeKey={activeKey}
            setActiveKey={setActiveKey}
            editingMode={editMode}
            value={album.intro}
            onSave={(v) => patch({ intro: v })}
            multiline
            className="text-[15px] leading-relaxed text-foreground/85 font-display"
            placeholder={t.intro}
            highlightQuery={q}
          />
        </div>

        <div className="space-y-8 px-5">
          {album.photos.map((p, i) => (
            <figure key={i} className={`polaroid ${i % 2 === 0 ? "rotate-[-1.5deg]" : "rotate-[1.5deg]"}`}>
              <img
                src={p.dataUrl}
                alt={p.caption}
                className="w-full aspect-[4/3] object-cover rounded-sm"
                loading="lazy"
                crossOrigin="anonymous"
              />
              <figcaption className="text-center font-display text-[15px] mt-3 text-foreground/80 px-2">
                <EditableText
                  editKey={`caption-${i}`}
                  activeKey={activeKey}
                  setActiveKey={setActiveKey}
                  editingMode={editMode}
                  value={p.caption}
                  onSave={(v) => patchCaption(i, v)}
                  multiline
                  className="text-center font-display text-[15px]"
                  placeholder={t.caption}
                  highlightQuery={q}
                />
              </figcaption>
            </figure>
          ))}
        </div>

        <div className="px-6 mt-12 pb-8 text-center">
          <EditableText
            editKey="closing"
            activeKey={activeKey}
            setActiveKey={setActiveKey}
            editingMode={editMode}
            value={album.closing}
            onSave={(v) => patch({ closing: v })}
            multiline
            className="text-[15px] leading-relaxed text-foreground/85 font-display italic text-center"
            placeholder={t.closing}
            highlightQuery={q}
          />
          <p className="text-[10px] warm-muted mt-8">
            {new Date(album.createdAt).toLocaleDateString()} · {t.madeWith}
          </p>
        </div>
      </div>

      <div className="px-6 mt-6">
        <button
          ref={downloadRef}
          onClick={downloadImage}
          disabled={downloading}
          className="w-full flex items-center justify-center gap-2 rounded-full py-3.5 text-[14px] text-primary-foreground shadow-[var(--shadow-warm)] disabled:opacity-60 active:scale-[0.98] transition-transform"
          style={{ background: "var(--gradient-warm)" }}
        >
          <Download size={16} /> {downloading ? t.preparing : t.download}
        </button>
      </div>

      <MapDialog
        open={mapOpen}
        onOpenChange={setMapOpen}
        mode={mapMode}
        location={album.location || ""}
        initialCoords={album.lat != null && album.lng != null ? { lat: album.lat, lng: album.lng } : undefined}
        fallbackCenter={lastCoords ?? undefined}
        onCoordsResolved={(c) => patch({ lat: c.lat, lng: c.lng })}
        onPick={({ lat, lng, label }) => {
          void patch({ lat, lng, location: label });
          toast.success(t.saved);
        }}
      />

      <EditCoachmark
        open={coachOpen}
        onClose={() => setCoachOpen(false)}
        pencilRef={pencilBtnRef}
        locationRef={locationChipRef}
        downloadRef={downloadRef}
      />

      <TagPickerDialog
        open={tagPickerOpen}
        onOpenChange={setTagPickerOpen}
        value={album.tags ?? []}
        onChange={(next) => patch({ tags: next })}
      />
    </div>
  );
}
