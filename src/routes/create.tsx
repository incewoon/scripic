import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ImagePlus, ArrowRight, X, GripVertical, Info } from "lucide-react";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { extractMeta, reverseGeocode, summarizePeriod, summarizeLocations, type PhotoMeta } from "@/lib/photoMeta";
import { useT, getLang, type ChatMode, type ChatTone } from "@/lib/i18n";
import { canCreateAlbumToday } from "@/lib/dailyLimit";
import { UploadLimitDialog } from "@/components/UploadLimitDialog";
import { PrivacyConsentDialog, shouldShowPrivacyConsent } from "@/components/PrivacyConsentDialog";

const PHOTO_MAX = 3;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXT = /\.(jpe?g|png|gif|webp|heic|heif|bmp|avif)$/i;

export const Route = createFileRoute("/create")({
  component: Create,
  head: () => ({ meta: [{ title: "New album — Rementory" }] }),
});

async function fileToDataUrl(file: File, maxDim = 1280): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = URL.createObjectURL(file);
  });
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", 0.82);
}

type Item = { id: string; url: string; meta: PhotoMeta };

function SortablePhoto({ item, index, onRemove }: { item: Item; index: number; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.85 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative aspect-square rounded-2xl overflow-hidden bg-muted shadow-[var(--shadow-soft)] touch-none"
      {...attributes}
      {...listeners}
    >
      <img src={item.url} alt="" className="w-full h-full object-cover pointer-events-none" />
      <div className="absolute top-1.5 left-1.5 bg-background/85 backdrop-blur rounded-full w-6 h-6 flex items-center justify-center text-[11px] font-semibold text-foreground/80">
        {index + 1}
      </div>
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(); }}
        className="absolute top-1.5 right-1.5 bg-background/90 rounded-full p-1.5 shadow-sm"
        aria-label="remove"
      ><X size={12} strokeWidth={2.5} /></button>
      <div className="absolute bottom-1.5 right-1.5 bg-background/70 backdrop-blur rounded-md p-0.5 text-foreground/60">
        <GripVertical size={12} />
      </div>
    </div>
  );
}

function Create() {
  const { t } = useT();
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<ChatMode>("creative");
  const [tone, setTone] = useState<ChatTone>("politely");
  const [limitReason, setLimitReason] = useState<"type" | "size" | null>(null);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);
  const navigate = useNavigate();

  // Daily limit guard — kick back to home if user navigated here directly.
  useEffect(() => {
    if (!canCreateAlbumToday()) {
      toast(t.dailyLimitBody);
      navigate({ to: "/" });
    }
  }, [navigate, t.dailyLimitBody]);

  useEffect(() => {
    if (items.length > prevCountRef.current && scrollRef.current) {
      const el = scrollRef.current;
      requestAnimationFrame(() => {
        el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      });
    }
    prevCountRef.current = items.length;
  }, [items.length]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );

  const tryOpenPicker = () => {
    if (items.length >= PHOTO_MAX) { toast(t.photoMax3); return; }
    inputRef.current?.click();
  };

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (inputRef.current) inputRef.current.value = "";
    if (!files.length) return;

    // Validate file types and sizes BEFORE processing.
    for (const f of files) {
      const isImage = f.type.startsWith("image/") || ALLOWED_EXT.test(f.name);
      if (!isImage) { setLimitReason("type"); return; }
      if (f.size > MAX_FILE_BYTES) { setLimitReason("size"); return; }
    }

    setBusy(true);
    try {
      const remaining = PHOTO_MAX - items.length;
      if (files.length > remaining) toast(t.photoMax3);
      const slice = files.slice(0, Math.max(0, remaining));
      const processed = await Promise.all(slice.map(async f => {
        const [url, meta] = await Promise.all([fileToDataUrl(f), extractMeta(f)]);
        return { id: crypto.randomUUID(), url, meta };
      }));
      if (processed.length) setItems(p => [...p, ...processed]);
    } finally {
      setBusy(false);
    }
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setItems(prev => {
      const oldIndex = prev.findIndex(i => i.id === active.id);
      const newIndex = prev.findIndex(i => i.id === over.id);
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  const next = async () => {
    if (items.length < 1) { toast.error(t.pickAtLeastOne); return; }
    setBusy(true);
    try {
      const lang = getLang();
      const metas = await Promise.all(items.map(async i => {
        if (i.meta.lat != null && i.meta.lng != null && !i.meta.city) {
          const city = await reverseGeocode(i.meta.lat, i.meta.lng, lang);
          return { ...i.meta, city };
        }
        return i.meta;
      }));
      sessionStorage.setItem("memori_photos", JSON.stringify(items.map(i => i.url)));
      sessionStorage.setItem("memori_photo_metas", JSON.stringify(metas));
      sessionStorage.setItem("memori_meta", JSON.stringify({
        period: summarizePeriod(metas, lang),
        location: summarizeLocations(metas),
      }));
      sessionStorage.setItem("memori_mode", mode);
      sessionStorage.setItem("memori_tone", tone);
      navigate({ to: "/chat" });
    } finally {
      setBusy(false);
    }
  };

  const count = items.length;
  const pct = Math.min(100, (count / PHOTO_MAX) * 100);

  return (
    <div className="mx-auto max-w-md flex flex-col h-[100dvh]">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 pt-6 pb-4">
        <header className="flex items-center justify-between mb-6">
          <Link to="/" className="p-2 -ml-2 text-foreground/70"><ArrowLeft size={20}/></Link>
          <span className="text-xs warm-muted">{count} / {PHOTO_MAX}</span>
        </header>

        <h1 className="font-display text-[28px] leading-tight warm-text mb-2">{t.pickPhotos}</h1>
        <p className="text-[15px] warm-muted mb-4 leading-relaxed">{t.pickHint}</p>

        <div
          className="mb-5 rounded-2xl px-4 py-3.5 flex items-start gap-3 border border-primary/25"
          style={{ background: "var(--gradient-warm)" }}
        >
          <Info size={18} className="text-primary mt-0.5 flex-shrink-0" />
          <div className="text-[13.5px] leading-relaxed warm-text">
            <b>{t.photoMax3}</b><br/>
            <span className="warm-muted">{t.dragHint}</span>
          </div>
        </div>

        <div className="mb-5">
          <div className="text-[12px] font-medium warm-muted mb-2">{t.chatMode}</div>
          <div className="flex gap-1.5 mb-2">
            {(["creative", "fact", "brief"] as ChatMode[]).map(m => {
              const label = m === "creative" ? t.modeCreative : m === "fact" ? t.modeFact : t.modeBrief;
              const active = mode === m;
              return (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`flex-1 px-3 py-2 rounded-full text-[13px] font-medium transition-all active:scale-[0.97] ${
                    active
                      ? "text-primary-foreground shadow-[var(--shadow-warm)]"
                      : "border border-border/60 warm-text bg-card/50"
                  }`}
                  style={active ? { background: "var(--gradient-warm)" } : undefined}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <div className="text-[12px] warm-muted leading-relaxed">
            {mode === "creative" ? t.modeCreativeDesc : mode === "fact" ? t.modeFactDesc : t.modeBriefDesc}
          </div>
        </div>

        <div className="mb-5">
          <div className="text-[12px] font-medium warm-muted mb-2">{t.toneSection}</div>
          <div className="flex gap-1.5 mb-2">
            {(["politely", "friendly", "short"] as ChatTone[]).map(tn => {
              const label = tn === "politely" ? t.tonePolitely : tn === "friendly" ? t.toneFriendly : t.toneShort;
              const active = tone === tn;
              return (
                <button
                  key={tn}
                  onClick={() => setTone(tn)}
                  className={`flex-1 px-3 py-2 rounded-full text-[13px] font-medium transition-all active:scale-[0.97] ${
                    active
                      ? "text-primary-foreground shadow-[var(--shadow-warm)]"
                      : "border border-border/60 warm-text bg-card/50"
                  }`}
                  style={active ? { background: "var(--gradient-warm)" } : undefined}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <div className="text-[12px] warm-muted leading-relaxed">
            {tone === "politely" ? t.tonePolitelyDesc : tone === "friendly" ? t.toneFriendlyDesc : t.toneShortDesc}
          </div>
        </div>

        <div className="h-1.5 bg-muted/70 rounded-full overflow-hidden mb-5">
          <div
            className="h-full transition-all duration-500 rounded-full"
            style={{ width: `${pct}%`, background: "var(--gradient-warm)" }}
          />
        </div>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={items.map(i => i.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-3 gap-2.5">
              {items.map((it, i) => (
                <SortablePhoto
                  key={it.id}
                  item={it}
                  index={i}
                  onRemove={() => setItems(ps => ps.filter(x => x.id !== it.id))}
                />
              ))}
              {items.length === 0 && (
                <button
                  onClick={tryOpenPicker}
                  disabled={busy}
                  className="aspect-square rounded-2xl border-2 border-dashed border-primary/40 flex flex-col items-center justify-center text-primary bg-card/50 active:scale-[0.97] transition-transform"
                >
                  <ImagePlus size={26} strokeWidth={1.6}/>
                  <span className="text-[11px] mt-1.5 warm-muted font-medium">{busy ? t.processing : t.addPhoto}</span>
                </button>
              )}
            </div>
          </SortableContext>
        </DndContext>

        <input ref={inputRef} type="file" accept="image/*" multiple onChange={onPick} className="hidden" />
      </div>

      <UploadLimitDialog open={limitReason !== null} reason={limitReason} onClose={() => setLimitReason(null)} />

      <div className="px-5 pt-3 pb-[max(env(safe-area-inset-bottom),1rem)] bg-gradient-to-t from-background via-background to-transparent space-y-2">
        {items.length > 0 && items.length < PHOTO_MAX && (
          <button
            onClick={tryOpenPicker}
            disabled={busy}
            className="w-full rounded-full py-3 text-[14px] font-medium flex items-center justify-center gap-2 border-2 border-dashed border-primary/40 text-primary bg-card/50 active:scale-[0.98] transition-transform disabled:opacity-50"
          >
            <ImagePlus size={18} strokeWidth={1.8}/>
            {busy ? t.processing : t.addPhoto}
          </button>
        )}
        <button
          onClick={next}
          disabled={items.length < 1 || busy}
          className="w-full rounded-full py-4 text-[15px] font-semibold flex items-center justify-center gap-2 disabled:opacity-50 shadow-[var(--shadow-warm)] active:scale-[0.98] transition-transform"
          style={{ background: "var(--gradient-warm)", color: "oklch(0.2 0.02 30)" }}
        >
          {items.length < 1
            ? t.pickAtLeastOne
            : <>{t.chatWithAi} <ArrowRight size={18}/></>}
        </button>
      </div>
    </div>
  );
}
