import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { getAlbums, deleteAlbum, subscribeAlbums, type Album } from "@/lib/storage";
import { Plus, BookHeart, Trash2, MapPin, Sparkles, LogOut, LogIn, X, Settings } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { fetchProfile, hasActiveSubscription, canCreateAlbum, type Profile } from "@/lib/premium";
import { Paywall } from "@/components/Paywall";
import { StorageNoticeDialog, hasSeenStorageNotice } from "@/components/StorageNoticeDialog";

const PAYWALL_AFTER_LOGIN_KEY = "memori_paywall_after_login";
const FREE_MAX = 5;

export const Route = createFileRoute("/")({
  component: Home,
  head: () => ({
    meta: [
      { title: "Memori — The story behind every photo" },
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
  const { user, loading: authLoading, signOut } = useAuth();
  const [albums, setAlbums] = useState<Album[] | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [paywall, setPaywall] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [limitOpen, setLimitOpen] = useState(false);
  const [limitDismissed, setLimitDismissed] = useState(false);
  const navigate = useNavigate();

  // First-run: show the storage notice automatically.
  useEffect(() => {
    if (!hasSeenStorageNotice()) setNoticeOpen(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const reload = () => { getAlbums().then((list) => { if (!cancelled) setAlbums(list); }); };
    reload();
    const unsub = subscribeAlbums(reload);
    return () => { cancelled = true; unsub(); };
  }, []);

  const reloadProfile = useCallback(async () => {
    if (!user) { setProfile(null); return; }
    const p = await fetchProfile();
    setProfile(p);
  }, [user]);

  useEffect(() => { reloadProfile(); }, [reloadProfile]);

  const count = albums?.length ?? 0;

  // Badge / status
  const subscribed = hasActiveSubscription(profile);

  // Total capacity for the current viewer.
  // - Subscribers: unlimited ("—")
  // - Signed-in non-subscribers: FREE_MAX baseline + any extra one-time credits
  //   they purchased on top. We approximate "extras" as max(album_credits - FREE_MAX, 0)
  //   so that the default 5 free credits granted on signup don't double-count
  //   on top of the local FREE_MAX (otherwise a guest who hits the limit and
  //   signs in would suddenly get 5 more slots for free).
  // - Guests: FREE_MAX flat.
  const extraPaidCredits = user && profile && !subscribed
    ? Math.max(0, profile.album_credits - FREE_MAX)
    : 0;
  const totalCapacity: number | "—" = subscribed
    ? "—"
    : FREE_MAX + extraPaidCredits;

  // Limit detection — based on actual local album count vs total capacity.
  // This is the source of truth: cloud `album_credits` alone is not enough,
  // because albums live in local storage and guest albums get migrated into
  // the account on first sign-in.
  const limitReached = (() => {
    if (subscribed) return false;
    if (albums === null) return false; // still loading
    if (typeof totalCapacity !== "number") return false;
    return count >= totalCapacity;
  })();

  // After login, if a paywall was queued (from limit popup), open it.
  useEffect(() => {
    if (!user || !profile) return;
    if (typeof window === "undefined") return;
    const queued = sessionStorage.getItem(PAYWALL_AFTER_LOGIN_KEY);
    if (!queued) return;
    sessionStorage.removeItem(PAYWALL_AFTER_LOGIN_KEY);
    // Re-evaluate against the merged (local + cloud) state. If they still
    // can't create an album after login, surface the paywall.
    if (limitReached) setPaywall(true);
  }, [user, profile, limitReached]);

  // Auto-show the limit popup once when reached (per session).
  useEffect(() => {
    if (limitReached && !limitDismissed && !paywall && !noticeOpen) {
      setLimitOpen(true);
    } else if (!limitReached) {
      setLimitOpen(false);
    }
  }, [limitReached, limitDismissed, paywall, noticeOpen]);

  const onCreate = async () => {
    // Always re-check against the freshest state at click time.
    // Guests: pure local count vs FREE_MAX.
    if (!user) {
      if (count >= FREE_MAX) { setLimitOpen(true); return; }
      navigate({ to: "/create" });
      return;
    }
    // Signed-in: refresh profile, then check local count vs total capacity.
    const fresh = await fetchProfile();
    setProfile(fresh);
    const subActive = hasActiveSubscription(fresh);
    if (subActive) { navigate({ to: "/create" }); return; }
    const extras = fresh ? Math.max(0, fresh.album_credits - FREE_MAX) : 0;
    const cap = FREE_MAX + extras;
    if (count >= cap) {
      setPaywall(true);
      return;
    }
    navigate({ to: "/create" });
  };

  const onDelete = async (id: string) => {
    await deleteAlbum(id);
    toast.success(t.deleted);
  };

  const onLimitSignIn = () => {
    setLimitOpen(false);
    if (user) {
      setPaywall(true);
    } else {
      try { sessionStorage.setItem(PAYWALL_AFTER_LOGIN_KEY, "1"); } catch {}
      navigate({ to: "/auth" });
    }
  };

  // Badge — visible for both guests and signed-in users so the tier is always clear.
  let badge: { label: string; cls: string } | null = null;
  if (user && profile) {
    if (subscribed) {
      badge = { label: t.badgeSubscribed, cls: "bg-amber-100 text-amber-800 border-amber-300" };
    } else if (profile.album_credits > FREE_MAX) {
      badge = { label: t.badgePaid, cls: "bg-violet-100 text-violet-800 border-violet-300" };
    } else {
      badge = { label: t.badgeFree, cls: "bg-emerald-100 text-emerald-800 border-emerald-300" };
    }
  } else if (!user && albums !== null) {
    badge = { label: t.badgeFree, cls: "bg-emerald-100 text-emerald-800 border-emerald-300" };
  }

  // Used count clamped against total capacity for the "used/total" indicator.
  const usedCount = typeof totalCapacity === "number" ? Math.min(count, totalCapacity) : count;
  const showCounter = albums !== null;

  return (
    <div className="mx-auto max-w-md min-h-screen px-5 pt-8 pb-32">
      <header className="mb-6 text-center">
        <button
          type="button"
          onClick={() => setNoticeOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full bg-card/70 px-3.5 py-1.5 text-[11px] warm-muted mb-3 border border-border/60 shadow-[var(--shadow-soft)] hover:bg-card transition-colors active:scale-[0.98]"
          aria-label={t.storageNoticeTitle}
        >
          <BookHeart size={12} className="text-primary" /> {t.storedLocally}
        </button>
        <h1 className="text-[40px] font-display warm-text mb-1 leading-none">memori</h1>
        <p className="text-[13px] warm-muted">{t.appTagline}</p>
      </header>

      {/* Auth (left) + album counter & tier badge (right) */}
      <div className="mb-5 flex items-center justify-between px-1 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {!user && !authLoading ? (
            <Link
              to="/auth"
              className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-card/80 px-2.5 py-1 text-[11.5px] font-medium warm-text shadow-[var(--shadow-soft)] hover:bg-card transition-colors active:scale-[0.98]"
              aria-label={t.signIn}
            >
              <LogIn size={11} className="text-primary" /> {t.signIn}
            </Link>
          ) : user ? (
            <button
              onClick={() => signOut()}
              className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-card/80 px-2.5 py-1 text-[11.5px] font-medium warm-muted hover:text-foreground hover:bg-card transition-colors active:scale-[0.98]"
              aria-label={t.signOut}
            >
              <LogOut size={11} /> {t.signOut}
            </button>
          ) : null}
          <Link
            to="/settings"
            className="inline-flex items-center justify-center rounded-full border border-border/60 bg-card/80 w-7 h-7 warm-muted hover:text-foreground hover:bg-card transition-colors active:scale-[0.96] shadow-[var(--shadow-soft)]"
            aria-label={t.settings}
            title={t.settings}
          >
            <Settings size={13} />
          </Link>
        </div>
        <div className="flex items-center gap-2">
          {badge && (
            <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border ${badge.cls}`}>
              {subscribed && <Sparkles size={10} />}
              {badge.label}
            </span>
          )}
          <h2 className="text-[13px] font-medium warm-muted">{t.myAlbums}</h2>
          {showCounter && (
            <span className="font-display text-[14px] warm-text leading-none tabular-nums">
              {usedCount}<span className="warm-muted">/{totalCapacity}</span>
            </span>
          )}
        </div>
      </div>



      {albums === null ? (
        <div className="text-center text-sm warm-muted py-20">{t.loading}</div>
      ) : albums.length === 0 ? (
        <button onClick={onCreate} className="w-full polaroid rotate-[-2deg] hover:rotate-0 transition-transform py-16 text-center">
          <div className="text-5xl mb-3">📷</div>
          <div className="font-display text-lg warm-text">{t.firstMemoryTitle}</div>
          <div className="text-xs warm-muted mt-1.5">{t.firstMemoryHint}</div>
        </button>
      ) : (
        <div className="space-y-5">
          {albums.map((a) => {
            const date = a.period || new Date(a.createdAt).toLocaleDateString(lang === "ko" ? "ko-KR" : "en-US", { year: "numeric", month: "short", day: "numeric" });
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
                    <span aria-hidden className="w-20 h-5" />
                  </div>
                </Link>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (confirm(t.confirmDelete)) onDelete(a.id);
                  }}
                  className="absolute bottom-2 right-2 z-10 text-muted-foreground/70 hover:text-destructive text-[12px] flex items-center gap-1 px-2 py-1 rounded-md bg-card/80 backdrop-blur-sm"
                >
                  <Trash2 size={12} /> {t.delete}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="fixed bottom-6 left-0 right-0 px-5 mx-auto max-w-md">
        <button
          onClick={onCreate}
          className="w-full rounded-full py-4 text-[15px] font-semibold flex items-center justify-center gap-2 shadow-[var(--shadow-warm)] active:scale-[0.98] transition-transform"
          style={{ background: "var(--gradient-warm)", color: "oklch(0.2 0.02 30)" }}
        >
          <Plus size={18}/> {t.newAlbum}
        </button>
      </div>

      <Paywall open={paywall} onClose={() => setPaywall(false)} onSuccess={reloadProfile} />
      <StorageNoticeDialog open={noticeOpen} onClose={() => setNoticeOpen(false)} />

      {/* Limit-reached bottom popup */}
      {limitOpen && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => { setLimitOpen(false); setLimitDismissed(true); }}
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
                <h2 className="font-display text-[20px] warm-text leading-tight">{t.limitReachedTitle}</h2>
              </div>
              <button
                onClick={() => { setLimitOpen(false); setLimitDismissed(true); }}
                className="p-1.5 -mr-1 -mt-1 text-muted-foreground hover:text-foreground"
                aria-label={t.close}
              >
                <X size={18} />
              </button>
            </div>
            <p className="text-[13.5px] warm-muted leading-relaxed mb-5">
              {t.limitReachedBodyGuest}
            </p>
            <button
              onClick={onLimitSignIn}
              className="w-full text-primary-foreground rounded-full py-3 text-[14px] font-medium active:scale-[0.98] transition-transform"
              style={{ background: "var(--gradient-warm)" }}
            >
              {user ? t.paywallTitle : t.limitReachedSignIn}
            </button>
            <button
              onClick={() => { setLimitOpen(false); setLimitDismissed(true); }}
              className="w-full text-center text-[12.5px] warm-muted mt-3 py-2"
            >
              {t.limitReachedDismiss}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
