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
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { extractMeta, summarizePeriod, type PhotoMeta } from "@/lib/photoMeta";
import { useT, getLang, type ChatMode, type ChatTone } from "@/lib/i18n";
import { canCreateAlbumToday } from "@/lib/dailyLimit";
import { UploadLimitDialog } from "@/components/UploadLimitDialog";
import { CreateUsageCoachmark, shouldShowCreateUsage } from "@/components/CreateUsageCoachmark";
import { ensureFirebaseUser } from "@/integrations/firebase/auth";
import { getAlbums } from "@/lib/storage";

const PHOTO_MAX = 3;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXT = /\.(jpe?g|png|gif|webp|heic|heif|bmp|avif)$/i;

export const Route = createFileRoute("/create")({
  component: Create,
  ssr: false,
  head: () => ({ meta: [{ title: "New album — Scripic" }] }),
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
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", 0.82);
}

type Item = { id: string; url: string; meta: PhotoMeta };

function SortablePhoto({ item, index, onRemove }: { item: Item; index: number; onRemove: () => void }) {
  const { t } = useT();
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
      <div
        className={`absolute top-1.5 left-1.5 bg-background/85 backdrop-blur rounded-full flex items-center justify-center text-[11px] font-semibold text-foreground/80 ${index === 0 ? "h-6 px-2" : "w-6 h-6"}`}
      >
        {index === 0 ? t.representative : index + 1}
      </div>
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onRemove();
        }}
        className="absolute top-1.5 right-1.5 bg-background/90 rounded-full p-1.5 shadow-sm"
        aria-label="remove"
      >
        <X size={12} strokeWidth={2.5} />
      </button>
      <div className="absolute bottom-1.5 right-1.5 bg-background/70 backdrop-blur rounded-md p-0.5 text-foreground/60">
        <GripVertical size={12} />
      </div>
    </div>
  );
}

const MODE_KEY = "scripic_default_mode";
const TONE_KEY = "scripic_default_tone";
const VALID_MODES: ChatMode[] = ["creative", "fact", "brief"];
const VALID_TONES: ChatTone[] = ["politely", "friendly", "short"];

function loadDefault<T extends string>(key: string, allowed: T[], fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const v = window.localStorage.getItem(key) as T | null;
    return v && allowed.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

function Create() {
  const { t } = useT();
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [myTags, setMyTags] = useState<string[]>([]);
  const [mode, setModeState] = useState<ChatMode>(() => loadDefault(MODE_KEY, VALID_MODES, "creative"));
  const [tone, setToneState] = useState<ChatTone>(() => loadDefault(TONE_KEY, VALID_TONES, "politely"));

  const setMode = (m: ChatMode) => {
    setModeState(m);
    try {
      window.localStorage.setItem(MODE_KEY, m);
    } catch {
      /* ignore */
    }
  };
  const setTone = (tn: ChatTone) => {
    setToneState(tn);
    try {
      window.localStorage.setItem(TONE_KEY, tn);
    } catch {
      /* ignore */
    }
  };
  const [limitReason, setLimitReason] = useState<"type" | "size" | null>(null);
  const [coachOpen, setCoachOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const photoSectionRef = useRef<HTMLDivElement>(null);
  const modeSectionRef = useRef<HTMLDivElement>(null);
  const toneSectionRef = useRef<HTMLDivElement>(null);
  const tagsSectionRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);
  const navigate = useNavigate();

  // Daily limit guard — kick back to home if user navigated here directly.
  useEffect(() => {
    if (!canCreateAlbumToday()) {
      toast(t.dailyLimitBody);
      navigate({ to: "/" });
    }
  }, [navigate, t.dailyLimitBody]);

  // First-visit coachmark on this device.
  useEffect(() => {
    if (shouldShowCreateUsage()) setCoachOpen(true);
  }, []);

  // Pre-warm Firebase anonymous auth + App Check token while the user picks
  // photos. By the time they tap "AI와 대화하기" the first /chat call doesn't
  // pay for sign-in or token issuance.
  useEffect(() => {
    void ensureFirebaseUser().catch(() => {
      /* retried at call time */
    });
  }, []);

  // Load previously-used custom tags (non-preset) from saved albums,
  // in first-seen order across albums (oldest album first).
  useEffect(() => {
    const presets = new Set<string>([
      t.tagPresetTravel,
      t.tagPresetFamily,
      t.tagPresetDaily,
      t.tagPresetFriends,
      t.tagPresetFood,
      t.tagPresetSpecial,
    ]);
    void getAlbums()
      .then((albums) => {
        const seen = new Set<string>();
        const out: string[] = [];
        // saveAlbum unshifts (newest first), so reverse for chronological add order.
        for (const a of [...albums].reverse()) {
          for (const tg of a.tags ?? []) {
            if (!tg) continue;
            if (presets.has(tg)) continue;
            const k = tg.toLowerCase();
            if (seen.has(k)) continue;
            seen.add(k);
            out.push(tg);
          }
        }
        setMyTags(out);
      })
      .catch(() => {
        /* ignore */
      });
  }, [t]);

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
    if (items.length >= PHOTO_MAX) {
      toast(t.photoMax3);
      return;
    }
    inputRef.current?.click();
  };

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (inputRef.current) inputRef.current.value = "";
    if (!files.length) return;

    // Validate file types and sizes BEFORE processing.
    for (const f of files) {
      const isImage = f.type.startsWith("image/") || ALLOWED_EXT.test(f.name);
      if (!isImage) {
        setLimitReason("type");
        return;
      }
      if (f.size > MAX_FILE_BYTES) {
        setLimitReason("size");
        return;
      }
    }

    setBusy(true);
    try {
      const remaining = PHOTO_MAX - items.length;
      if (files.length > remaining) toast(t.photoMax3);
      const slice = files.slice(0, Math.max(0, remaining));
      const processed = await Promise.all(
        slice.map(async (f) => {
          const [url, meta] = await Promise.all([fileToDataUrl(f), extractMeta(f)]);
          return { id: crypto.randomUUID(), url, meta };
        }),
      );
      if (processed.length) setItems((p) => [...p, ...processed]);
    } finally {
      setBusy(false);
    }
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setItems((prev) => {
      const oldIndex = prev.findIndex((i) => i.id === active.id);
      const newIndex = prev.findIndex((i) => i.id === over.id);
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  const next = async () => {
    if (items.length < 1) {
      toast.error(t.pickAtLeastOne);
      return;
    }
    setBusy(true);
    try {
      const lang = getLang();
      // Location intentionally omitted — user picks it manually on the album
      // detail screen after creation. Only `takenAt`-derived period is kept.
      const metas: PhotoMeta[] = items.map((i) => ({ takenAt: i.meta.takenAt }));

      sessionStorage.setItem("memori_photos", JSON.stringify(items.map((i) => i.url)));
      sessionStorage.setItem("memori_photo_metas", JSON.stringify(metas));
      sessionStorage.setItem(
        "memori_meta",
        JSON.stringify({
          period: summarizePeriod(metas, lang),
        }),
      );
      sessionStorage.setItem("memori_mode", mode);
      sessionStorage.setItem("memori_tone", tone);
      sessionStorage.setItem("memori_tags", JSON.stringify(tags));
      navigate({ to: "/chat" });
    } finally {
      setBusy(false);
    }
  };

  const count = items.length;
  const pct = Math.min(100, (count / PHOTO_MAX) * 100);

  return (
    <div className="mx-auto max-w-md flex flex-col h-[100dvh]">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 pt-3 pb-1">
        <header className="flex items-center justify-between mb-3">
          <Link to="/" className="p-2 -ml-2 text-foreground/70">
            <ArrowLeft size={20} />
          </Link>
          <span className="text-xs warm-muted">
            {count} / {PHOTO_MAX}
          </span>
        </header>
        <h1 className="font-display text-[28px] leading-tight warm-text mb-1">{t.pickPhotos}</h1>
        <p className="text-[15px] warm-muted mb-3 leading-relaxed">{t.pickHint}</p>
        <div className="card-info mb-2 rounded-2xl px-3 py-2.5 flex items-start gap-2.5">
          <Info size={18} className="mt-0.5 flex-shrink-0" style={{ color: "var(--cta-accent)" }} />
          <div className="text-[13px] leading-snug">
            <b className="font-semibold">{t.photoMax3}</b>
            <span className="block text-[12px] info-muted mt-1">{t.dragHint}</span>
          </div>
        </div>
        {/* 사진 그리드 */}
        <div ref={photoSectionRef}>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={items.map((i) => i.id)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-3 gap-2.5 mb-1">
                {items.map((it, i) => (
                  <SortablePhoto
                    key={it.id}
                    item={it}
                    index={i}
                    onRemove={() => setItems((ps) => ps.filter((x) => x.id !== it.id))}
                  />
                ))}
                {items.length < PHOTO_MAX && (
                  <button
                    type="button"
                    onClick={tryOpenPicker}
                    disabled={busy}
                    className="aspect-square rounded-2xl border-2 border-dashed border-primary/40 flex flex-col items-center justify-center text-primary bg-card/50 active:scale-[0.97] transition-transform"
                  >
                    <ImagePlus size={26} strokeWidth={1.6} />
                    <span className="text-[11px] mt-1.5 warm-muted font-medium">
                      {busy ? t.processing : t.addPhoto}
                    </span>
                  </button>
                )}
              </div>
            </SortableContext>
          </DndContext>
          <input ref={inputRef} type="file" accept="image/*" multiple onChange={onPick} className="hidden" />
        </div>
        <div ref={modeSectionRef} className="mt-4 mb-5">
          <div className="text-[12px] font-medium warm-muted mb-2">
            <b className="font-semibold">{t.chatMode}</b>
          </div>
          <div className="flex gap-1.5 mb-2">
            {(["creative", "fact", "brief"] as ChatMode[]).map((m) => {
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
        <div ref={toneSectionRef} className="mb-5">
          <div className="text-[12px] font-medium warm-muted mb-2">
            <b className="font-semibold">{t.toneSection}</b>
          </div>
          <div className="flex gap-1.5 mb-2">
            {(["politely", "friendly", "short"] as ChatTone[]).map((tn) => {
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
        <div ref={tagsSectionRef} className="mb-1">
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-[12px] font-medium warm-muted">
              <b className="font-semibold">{t.tagsLabel}</b>
            </span>
            <span className="text-[12px] warm-muted">{t.tagsHint}</span>
          </div>
          {(() => {
            const presets: string[] = [
              t.tagPresetTravel,
              t.tagPresetFamily,
              t.tagPresetDaily,
              t.tagPresetFriends,
              t.tagPresetFood,
              t.tagPresetSpecial,
            ];
            const customTags = tags.filter((tg) => !presets.includes(tg) && !myTags.includes(tg));
            return (
              <>
                <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1">
                  {presets.map((p) => {
                    const active = tags.includes(p);
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => {
                          setTags((prev) => {
                            if (prev.includes(p)) return prev.filter((x) => x !== p);
                            if (prev.length >= 5) return prev;
                            return [...prev, p];
                          });
                        }}
                        className={`px-3 py-1.5 rounded-full whitespace-nowrap flex-shrink-0 text-[12px] font-medium transition-all active:scale-[0.97] ${
                          active
                            ? "text-primary-foreground shadow-[var(--shadow-warm)]"
                            : "border border-border/60 warm-text bg-card/50"
                        }`}
                        style={active ? { background: "var(--gradient-warm)" } : undefined}
                      >
                        #{p}
                      </button>
                    );
                  })}
                  {myTags.map((p) => {
                    const active = tags.includes(p);
                    return (
                      <button
                        key={`my-${p}`}
                        type="button"
                        onClick={() => {
                          setTags((prev) => {
                            if (prev.includes(p)) return prev.filter((x) => x !== p);
                            if (prev.length >= 5) return prev;
                            return [...prev, p];
                          });
                        }}
                        className={`px-3 py-1.5 rounded-full whitespace-nowrap flex-shrink-0 text-[12px] font-medium transition-all active:scale-[0.97] ${
                          active
                            ? "text-primary-foreground shadow-[var(--shadow-warm)]"
                            : "border border-border/60 warm-text bg-card/50"
                        }`}
                        style={active ? { background: "var(--gradient-warm)" } : undefined}
                      >
                        #{p}
                      </button>
                    );
                  })}
                </div>
                {customTags.length > 0 && (
                  <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1">
                    {customTags.map((tg) => (
                      <span
                        key={tg}
                        className="inline-flex items-center px-3 py-1.5 rounded-full whitespace-nowrap flex-shrink-0 text-[12px] font-medium text-primary-foreground shadow-[var(--shadow-warm)]"
                        style={{ background: "var(--gradient-warm)" }}
                      >
                        #{tg}
                        <button
                          type="button"
                          onClick={() => setTags((prev) => prev.filter((x) => x !== tg))}
                          aria-label="remove"
                          className="opacity-90"
                        >
                          <X size={11} strokeWidth={2.5} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </>
            );
          })()}
          <div className="flex gap-1.5">
            <input
              type="text"
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  const v = tagDraft.trim().replace(/^#/, "").slice(0, 20);
                  if (!v) return;
                  setTags((prev) => {
                    if (prev.some((x) => x.toLowerCase() === v.toLowerCase())) return prev;
                    if (prev.length >= 5) return prev;
                    return [...prev, v];
                  });
                  setTagDraft("");
                }
              }}
              placeholder={t.tagAddPlaceholder}
              maxLength={20}
              className="flex-1 h-9 rounded-full border border-border/60 bg-card/80 px-3.5 text-[12.5px] warm-text placeholder:warm-muted focus:outline-none focus:bg-card"
            />
            <button
              type="button"
              onClick={() => {
                const v = tagDraft.trim().replace(/^#/, "").slice(0, 20);
                if (!v) return;
                setTags((prev) => {
                  if (prev.some((x) => x.toLowerCase() === v.toLowerCase())) return prev;
                  if (prev.length >= 5) return prev;
                  return [...prev, v];
                });
                setTagDraft("");
              }}
              className="h-9 px-3.5 rounded-full text-[12.5px] font-medium border border-border/60 warm-text bg-card/50 active:scale-[0.97]"
            >
              {t.tagAdd}
            </button>
          </div>
        </div>
      </div>

      <UploadLimitDialog open={limitReason !== null} reason={limitReason} onClose={() => setLimitReason(null)} />
      <CreateUsageCoachmark
        open={coachOpen}
        onClose={() => setCoachOpen(false)}
        photoRef={photoSectionRef}
        modeRef={modeSectionRef}
        toneRef={toneSectionRef}
        tagsRef={tagsSectionRef}
      />

      <div className="px-5 pt-1 pb-[max(env(safe-area-inset-bottom),0.5rem)] bg-gradient-to-t from-background via-background to-transparent space-y-2">
        {items.length > 0 && items.length < PHOTO_MAX && (
          <button
            onClick={tryOpenPicker}
            disabled={busy}
            className="w-full rounded-full py-3 text-[14px] font-medium flex items-center justify-center gap-2 border-2 border-dashed border-primary/40 text-primary bg-card/50 active:scale-[0.98] transition-transform disabled:opacity-50"
          >
            <ImagePlus size={18} strokeWidth={1.8} />
            {busy ? t.processing : t.addPhoto}
          </button>
        )}
        <button
          onClick={next}
          disabled={items.length < 1 || busy}
          className="btn-cta w-full py-4 text-[15px] flex items-center justify-center gap-2 active:scale-[0.98]"
        >
          {items.length < 1 ? (
            t.pickAtLeastOne
          ) : (
            <>
              {t.chatWithAi} <ArrowRight size={18} />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
