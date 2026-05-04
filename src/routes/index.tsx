import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { getAlbums, deleteAlbum, subscribeAlbums, type Album } from "@/lib/storage";
import { Plus, BookHeart, Trash2, MapPin, Sparkles, LogOut, LogIn, X } from "lucide-react";
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

  // Limit detection — true when user has used all available album slots (free + one-time credits)
  // and is not subscribed. For guests we approximate by their local album count vs FREE_MAX.
  const limitReached = (() => {
    if (subscribed) return false;
    if (user) {
      return profile !== null && !canCreateAlbum(profile);
    }
    return count >= FREE_MAX;
  })();

  // After login, if a paywall was queued (from limit popup), open it.
  useEffect(() => {
    if (!user || !profile) return;
    if (typeof window === "undefined") return;
    const queued = sessionStorage.getItem(PAYWALL_AFTER_LOGIN_KEY);
    if (queued && !canCreateAlbum(profile)) {
      sessionStorage.removeItem(PAYWALL_AFTER_LOGIN_KEY);
      setPaywall(true);
    } else if (queued) {
      sessionStorage.removeItem(PAYWALL_AFTER_LOGIN_KEY);
    }
  }, [user, profile]);

  // Auto-show the limit popup once when reached (per session).
  useEffect(() => {
    if (limitReached && !limitDismissed && !paywall && !noticeOpen) {
      setLimitOpen(true);
    } else if (!limitReached) {
      setLimitOpen(false);
    }
  }, [limitReached, limitDismissed, paywall, noticeOpen]);

  const onCreate = () => {
    if (!user) {
      if (count >= FREE_MAX) { setLimitOpen(true); return; }
      navigate({ to: "/auth" });
      return;
    }
    if (!canCreateAlbum(profile)) {
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

  // Badge
  let badge: { label: string; cls: string } | null = null;
  if (user && profile) {
    if (subscribed) {
      badge = { label: t.badgeSubscribed, cls: "bg-amber-100 text-amber-800 border-amber-300" };
    } else if (profile.album_credits > FREE_MAX) {
      badge = { label: t.badgePaid(profile.album_credits), cls: "bg-violet-100 text-violet-800 border-violet-300" };
    } else {
      const used = Math.min(count, FREE_MAX);
      badge = { label: t.badgeFree(used, FREE_MAX), cls: "bg-emerald-100 text-emerald-800 border-emerald-300" };
    }
  }

  return (
    <div className="mx-auto max-w-md min-h-screen px-5 pt-14 pb-32">
      {/* Top-right small auth button */}
      {!user && !authLoading && (
        <Link
          to="/auth"
          className="fixed top-3 right-3 z-30 inline-flex items-center gap-1 rounded-full border border-border/60 bg-card/80 backdrop-blur px-3 py-1.5 text-[11.5px] font-medium warm-text shadow-[var(--shadow-soft)] hover:bg-card transition-colors active:scale-[0.98]"
          aria-label={t.signIn}
        >
          <LogIn size={12} className="text-primary" /> {t.signIn}
        </Link>
      )}

      <header className="mb-10 text-center">
        <button
          type="button"
          onClick={() => setNoticeOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full bg-card/70 px-3.5 py-1.5 text-[11px] warm-muted mb-5 border border-border/60 shadow-[var(--shadow-soft)] hover:bg-card transition-colors active:scale-[0.98]"
          aria-label={t.storageNoticeTitle}
        >
          <BookHeart size={12} className="text-primary" /> {t.storedLocally}
        </button>
        <h1 className="text-[44px] font-display warm-text mb-2 leading-none">memori</h1>
        <p className="text-[14px] warm-muted">{t.appTagline}</p>
      </header>

      {/* Album count + status badge */}
      <div className="mb-5 flex items-center justify-between px-1">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[15px] font-medium warm-text">{t.myAlbums}</h2>
          <span className="font-display text-[26px] warm-text leading-none">{count}</span>
        </div>
        <div className="flex items-center gap-2">
          {badge && (
            <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border ${badge.cls}`}>
              {subscribed && <Sparkles size={10} />}
              {badge.label}
            </span>
          )}
          {user && (
            <button onClick={() => signOut()} className="p-1.5 text-muted-foreground hover:text-foreground" aria-label="sign out">
              <LogOut size={14} />
            </button>
          )}
        </div>
      </div>

      {!user && !authLoading && (
        <div className="mb-5 rounded-2xl border border-border/60 bg-card/60 p-4 text-center">
          <p className="text-[13px] warm-muted mb-3">{t.authIntro}</p>
          <Link to="/auth" className="inline-block rounded-full px-5 py-2 text-[13px] font-medium text-primary-foreground" style={{ background: "var(--gradient-warm)" }}>
            {t.signIn}
          </Link>
        </div>
      )}

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
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (confirm(t.confirmDelete)) onDelete(a.id); }}
                      className="text-muted-foreground/70 hover:text-destructive text-[12px] flex items-center gap-1 px-2 py-1 -mr-2 rounded-md"
                    >
                      <Trash2 size={12} /> {t.delete}
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
          className="w-full text-primary-foreground rounded-full py-4 text-[15px] font-medium flex items-center justify-center gap-2 shadow-[var(--shadow-warm)] active:scale-[0.98] transition-transform"
          style={{ background: "var(--gradient-warm)" }}
        >
          <Plus size={18}/> {t.newAlbum}
        </button>
      </div>

      <Paywall open={paywall} onClose={() => setPaywall(false)} onSuccess={reloadProfile} />
      <StorageNoticeDialog open={noticeOpen} onClose={() => setNoticeOpen(false)} />
    </div>
  );
}
