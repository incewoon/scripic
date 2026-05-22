import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getAlbums, subscribeAlbums, type Album } from "@/lib/storage";
import { Plus, BookHeart, MapPin, Settings, ArrowUpDown, X, Sparkles } from "lucide-react";
import { useT } from "@/lib/i18n";
import { canCreateAlbumToday, nextAvailableDateLabel, hasExtraUsedToday } from "@/lib/dailyLimit";
import { StorageNoticeDialog, hasSeenStorageNotice } from "@/components/StorageNoticeDialog";
import { ReviewRewardDialog } from "@/components/ReviewRewardDialog";

const SORT_KEY = "moara_album_sort_v1";
const SORT_DIR_KEY = "moara_album_sort_dir_v1";
type SortMode = "created" | "photo";
type SortDir = "desc" | "asc";

function parsePeriodDate(period?: string): number {
  if (!period) return 0;
  // "26.05.09", "26.05.09~10", "2026.05.09", "26-05-09", "2026년 5월 9일" 등
  const m = period.match(/(\d{2,4})[.\-/년\s]+(\d{1,2})[.\-/월\s]+(\d{1,2})/);
  if (m) {
    let y = Number(m[1]);
    if (y < 100) y += 2000;
    const mo = Number(m[2]) - 1;
    const d = Number(m[3]);
    if (mo >= 0 && mo <= 11 && d >= 1 && d <= 31) {
      return Date.UTC(y, mo, d);
    }
  }
  const iso = period.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return Date.UTC(+iso[1], +iso[2] - 1, +iso[3]);
  return 0;
}

export const Route = createFileRoute("/")({
  component: Home,
  head: () => ({
    meta: [
      { title: "Scripic — Capture the moments you never want to forget" },
      { name: "description", content: "Turn photos into a tender story album." },
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
  const { t, lang } = useT();
  const [albums, setAlbums] = useState<Album[] | null>(null);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [limitOpen, setLimitOpen] = useState(false);
  const [rewardOpen, setRewardOpen] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("created");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [sortOpen, setSortOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => { if (!hasSeenStorageNotice()) setNoticeOpen(true); }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SORT_KEY);
      if (saved === "created" || saved === "photo") setSortMode(saved);
      const dir = localStorage.getItem(SORT_DIR_KEY);
      if (dir === "desc" || dir === "asc") setSortDir(dir);
    } catch {}
  }, []);

  const changeSort = (m: SortMode) => {
    setSortMode(m);
    setSortOpen(false);
    try { localStorage.setItem(SORT_KEY, m); } catch {}
  };

  const toggleDir = () => {
    setSortDir((prev) => {
      const next = prev === "desc" ? "asc" : "desc";
      try { localStorage.setItem(SORT_DIR_KEY, next); } catch {}
      return next;
    });
  };

  useEffect(() => {
    let cancelled = false;
    const reload = () => { getAlbums().then((list) => { if (!cancelled) setAlbums(list); }); };
    reload();
    const unsub = subscribeAlbums(reload);
    return () => { cancelled = true; unsub(); };
  }, []);

  const count = albums?.length ?? 0;

  const sortedAlbums = albums
    ? [...albums].sort((a, b) => {
        let diff: number;
        if (sortMode === "photo") {
          const ad = parsePeriodDate(a.period) || a.createdAt;
          const bd = parsePeriodDate(b.period) || b.createdAt;
          diff = bd - ad;
        } else {
          diff = b.createdAt - a.createdAt;
        }
        return sortDir === "desc" ? diff : -diff;
      })
    : null;

  const onCreate = () => {
    if (!canCreateAlbumToday()) { setLimitOpen(true); return; }
    navigate({ to: "/create" });
  };

  return (
    <div className="mx-auto max-w-md min-h-screen px-5 pt-8 pb-44">
      <header className="mb-6 text-center">
        <button
          type="button"
          onClick={() => setNoticeOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full bg-card/70 px-3.5 py-1.5 text-[11px] warm-muted mb-3 border border-border/60 shadow-[var(--shadow-soft)] hover:bg-card transition-colors active:scale-[0.98]"
          aria-label={t.storageNoticeTitle}
        >
          <BookHeart size={12} className="text-primary" /> {t.storedLocally}
        </button>
        <h1 className="text-[40px] font-display warm-text mb-1 leading-none">Scripic</h1>
        <p className="text-[13px] warm-muted">{t.appTagline}</p>
      </header>

      <div className="mb-5 flex items-center justify-between px-1 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-[13px] font-medium warm-muted">{t.myAlbums}</h2>
          {albums !== null && (
            <span className="font-display text-[14px] warm-text leading-none tabular-nums">{count}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Link
            to="/settings"
            className="inline-flex items-center justify-center rounded-full border border-border/60 bg-card/80 h-7 w-7 warm-muted hover:text-foreground hover:bg-card transition-colors active:scale-[0.96] shadow-[var(--shadow-soft)]"
            aria-label={t.settings}
            title={t.settings}
          >
            <Settings size={12} />
          </Link>
          <div className="relative">
            <button
              type="button"
              onClick={() => setSortOpen((v) => !v)}
              className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-card/80 pl-2 pr-2.5 h-7 text-[11px] font-medium warm-muted hover:text-foreground hover:bg-card transition-colors active:scale-[0.96] shadow-[var(--shadow-soft)]"
              aria-label={t.sortBy}
              title={t.sortBy}
            >
              <ArrowUpDown size={11} />
              <span>{sortMode === "created" ? t.sortCreatedDate : t.sortPhotoDate}</span>
            </button>
            {sortOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setSortOpen(false)} />
                <div className="absolute z-20 mt-1 right-0 min-w-[140px] rounded-xl border border-border/60 bg-card shadow-[var(--shadow-soft)] py-1">
                  {(["created", "photo"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => changeSort(m)}
                      className={`block w-full text-left px-3 py-1.5 text-[12px] hover:bg-muted/60 transition-colors ${sortMode === m ? "warm-text font-semibold" : "warm-muted"}`}
                    >
                      {m === "created" ? t.sortCreatedDate : t.sortPhotoDate}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={toggleDir}
            className="inline-flex items-center justify-center rounded-full border border-border/60 bg-card/80 h-7 px-2 text-[11px] font-medium warm-muted hover:text-foreground hover:bg-card transition-colors active:scale-[0.96] shadow-[var(--shadow-soft)]"
            aria-label={sortDir === "desc" ? t.sortDesc : t.sortAsc}
            title={sortDir === "desc" ? t.sortDesc : t.sortAsc}
          >
            {sortDir === "desc" ? "↓" : "↑"}
          </button>
        </div>
      </div>

      {albums === null ? (
        <div className="text-center text-sm warm-muted py-20">{t.loading}</div>
      ) : albums.length === 0 ? (
        <button onClick={onCreate} className="w-full polaroid rotate-[-2deg] hover:rotate-0 transition-transform py-16 text-center">
          <div className="text-5xl mb-3">📷</div>
          <div className="font-display text-lg warm-text">{t.firstMemoryTitle}</div>
          <div className="text-sm warm-text mt-2">{t.firstMemoryTagline}</div>
          <div className="text-xs warm-muted mt-1.5">{t.firstMemoryHint}</div>
        </button>
      ) : (
        <div className="space-y-5">
          {(sortedAlbums ?? albums).map((a) => {
            const locale = lang === "ko" ? "ko-KR" : "en-US";
            const date = a.period || new Date(a.createdAt).toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
            const createdDate = new Date(a.createdAt).toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
            return (
              <div key={a.id} className="album-card group relative">
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
                      <div className="text-[10px] uppercase tracking-[0.15em] opacity-80 mb-1 flex items-center gap-2">
                        <span>{date}</span>
                        {a.location && <span className="flex items-center gap-1"><MapPin size={9}/>{a.location}</span>}
                      </div>
                      <div className="font-display text-[20px] leading-tight drop-shadow-sm">{a.title}</div>
                      <div className="text-[12px] opacity-90 mt-1 italic font-display">{a.subtitle}</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="text-[12px] warm-muted">{t.photosCount(a.photos.length)}</span>
                    <span className="text-[12px] warm-muted tabular-nums">{createdDate}</span>
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
          className="btn-cta w-full py-4 text-[15px] flex items-center justify-center gap-2 active:scale-[0.98]"
        >
          <Plus size={18} strokeWidth={2.5}/> {t.newAlbum}
        </button>
      </div>


      <StorageNoticeDialog open={noticeOpen} onClose={() => setNoticeOpen(false)} />

      {limitOpen && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setLimitOpen(false)}
        >
          <div
            className="w-full sm:max-w-md bg-background rounded-t-[28px] border border-border/60 shadow-2xl p-6 pb-[max(env(safe-area-inset-bottom),1.5rem)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "var(--gradient-warm)" }}>
                  <Sparkles size={16} className="text-primary-foreground" />
                </div>
                <h2 className="font-display text-[20px] warm-text leading-tight">{t.dailyLimitTitle}</h2>
              </div>
              <button onClick={() => setLimitOpen(false)} className="p-1.5 -mr-1 -mt-1 text-muted-foreground hover:text-foreground"><X size={18} /></button>
            </div>
            <p className="text-[13.5px] warm-muted leading-relaxed mb-2">{t.dailyLimitBody}</p>
            <p className="text-[12px] warm-muted mb-5">{t.dailyLimitNextAt(nextAvailableDateLabel(lang))}</p>
            {!hasExtraUsedToday() && (
              <button
                onClick={() => { setLimitOpen(false); setRewardOpen(true); }}
                className="w-full mb-2 rounded-full py-3 text-[14px] font-medium active:scale-[0.98] transition-transform border border-primary/40 bg-primary/10 warm-text inline-flex items-center justify-center gap-2"
              >
                <Sparkles size={14} /> {t.reviewRewardCta}
              </button>
            )}
            <button
              onClick={() => setLimitOpen(false)}
              className="w-full text-primary-foreground rounded-full py-3 text-[14px] font-medium active:scale-[0.98] transition-transform"
              style={{ background: "var(--gradient-warm)" }}
            >
              {t.okay}
            </button>
          </div>
        </div>
      )}

      <ReviewRewardDialog
        open={rewardOpen}
        onClose={() => setRewardOpen(false)}
        onGranted={() => { /* user can press Okay to close, then create */ }}
      />

    </div>
  );
}
