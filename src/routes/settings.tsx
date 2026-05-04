import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  Bell,
  BellOff,
  User,
  CreditCard,
  Archive,
  Download,
  Upload,
  Sparkles,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { requestNotificationPermission, openAppSettings, isNativeShell } from "@/lib/native";
import {
  fetchProfile,
  hasActiveSubscription,
  PRODUCTS,
  type Profile,
} from "@/lib/premium";
import { restore } from "@/lib/billing";
import { Paywall } from "@/components/Paywall";
import { exportBackupZip, importBackupZip } from "@/lib/backup";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
  head: () => ({
    meta: [
      { title: "Settings — memori" },
      { name: "description", content: "Manage your memori account, purchases and album backups." },
    ],
  }),
});

type Purchase = {
  id: string;
  product_id: string;
  amount_usd: number | null;
  created_at: string;
};

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function SettingsPage() {
  const { t, lang } = useT();
  const { user, loading } = useAuth();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [paywall, setPaywall] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const tapCountRef = useRef(0);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCopyrightTap = () => {
    tapCountRef.current += 1;
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    tapTimerRef.current = setTimeout(() => {
      tapCountRef.current = 0;
    }, 1500);
    if (tapCountRef.current >= 7) {
      tapCountRef.current = 0;
      if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
      navigate({ to: "/easter" });
    }
  };

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setEnabled(null);
      setProfile(null);
      setPurchases([]);
      return;
    }
    (async () => {
      const [{ data: notif }, prof, { data: purch }] = await Promise.all([
        supabase.from("profiles").select("notifications_enabled").maybeSingle(),
        fetchProfile(),
        supabase
          .from("purchases")
          .select("id, product_id, amount_usd, created_at")
          .order("created_at", { ascending: false })
          .limit(5),
      ]);
      if (cancelled) return;
      setEnabled(Boolean(notif?.notifications_enabled));
      setProfile(prof);
      setPurchases((purch ?? []) as Purchase[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const reloadProfile = async () => {
    const p = await fetchProfile();
    setProfile(p);
  };

  const toggle = async () => {
    if (!user || enabled === null) return;
    setBusy(true);
    try {
      if (!enabled) {
        const r = await requestNotificationPermission();
        if (r === "denied") {
          toast.error(t.notifPermissionDenied, {
            action: { label: t.openSettings, onClick: () => openAppSettings() },
          });
          setBusy(false);
          return;
        }
      }
      const next = !enabled;
      const { error } = await supabase
        .from("profiles")
        .update({
          notifications_enabled: next,
          notifications_updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);
      if (error) throw error;
      setEnabled(next);
      toast.success(t.saved);
    } catch (e) {
      console.error(e);
      toast.error(t.failed);
    } finally {
      setBusy(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportBackupZip({
        userId: user?.id ?? null,
        email: user?.email ?? null,
      });
      toast.success(t.saved);
    } catch (e) {
      console.error(e);
      toast.error(t.failed);
    } finally {
      setExporting(false);
    }
  };

  const handleRestoreFile = async (file: File) => {
    setRestoring(true);
    try {
      const result = await importBackupZip(file, user?.id ?? null);
      if (!result.ok) {
        if (result.reason === "owner_mismatch") toast.error(t.backupOwnerMismatch);
        else if (result.reason === "guest_only_mismatch") toast.error(t.backupGuestOnlyMismatch);
        else toast.error(t.backupInvalid);
        return;
      }
      toast.success(t.backupDone(result.imported));
      if (result.skippedFreeLimit > 0) {
        toast.message(t.backupSkippedFreeLimit(result.skippedFreeLimit));
      }
    } catch (e) {
      console.error(e);
      toast.error(t.backupInvalid);
    } finally {
      setRestoring(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleRestorePurchases = async () => {
    if (!isNativeShell()) {
      toast.message(t.restoreNotAvailable);
      return;
    }
    try {
      await restore();
      await reloadProfile();
      toast.success(t.saved);
    } catch (e) {
      console.error(e);
      toast.error(t.failed);
    }
  };

  // Account state derivation
  const subActive = hasActiveSubscription(profile);
  const extraCredits = Math.max(0, (profile?.album_credits ?? 0) - 5);

  // Try to detect monthly vs yearly from most recent successful subscription purchase
  const lastSub = purchases.find((p) => p.product_id === "sub_monthly" || p.product_id === "sub_yearly");
  const subKind: "monthly" | "yearly" | "active" = lastSub?.product_id === "sub_yearly"
    ? "yearly"
    : lastSub?.product_id === "sub_monthly"
      ? "monthly"
      : "active";

  const productLabel = (id: string) => {
    if (id === "credits_10") return lang === "ko" ? PRODUCTS.credits_10.titleKo : PRODUCTS.credits_10.titleEn;
    if (id === "sub_monthly") return lang === "ko" ? PRODUCTS.sub_monthly.titleKo : PRODUCTS.sub_monthly.titleEn;
    if (id === "sub_yearly") return lang === "ko" ? PRODUCTS.sub_yearly.titleKo : PRODUCTS.sub_yearly.titleEn;
    return id;
  };

  return (
    <div className="mx-auto max-w-md min-h-screen px-5 pt-10 pb-20">
      <div className="mb-8 flex items-center gap-2">
        <Link to="/" className="p-2 -ml-2 text-muted-foreground hover:text-foreground" aria-label={t.backHome}>
          <ChevronLeft size={20} />
        </Link>
        <h1 className="font-display text-[26px] warm-text leading-none">{t.settings}</h1>
      </div>

      {/* A. Account */}
      <section className="rounded-3xl border border-border/60 bg-card/70 p-5 shadow-[var(--shadow-soft)] mb-4">
        <div className="flex items-start gap-3 mb-3">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0" style={{ background: "var(--gradient-warm)" }}>
            <User size={18} className="text-primary-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-display text-[17px] warm-text leading-tight">{t.accountSection}</h2>
            {!user && !loading ? (
              <p className="text-[12.5px] warm-muted mt-1">{t.guestStatus}</p>
            ) : user ? (
              <>
                <p className="text-[13px] warm-text mt-1 truncate">
                  {profile?.display_name || user.email}
                </p>
                {profile?.email && profile.display_name && (
                  <p className="text-[11.5px] warm-muted truncate">{profile.email}</p>
                )}
              </>
            ) : null}
          </div>
        </div>

        {!user && !loading ? (
          <Link
            to="/auth"
            className="block w-full text-center rounded-full px-5 py-2.5 text-[13px] font-semibold"
            style={{ background: "var(--gradient-warm)", color: "oklch(0.2 0.02 30)" }}
          >
            {t.signIn}
          </Link>
        ) : user ? (
          <div className="rounded-2xl bg-background/60 border border-border/60 px-4 py-3 text-[13px]">
            {subActive ? (
              <div>
                <div className="flex items-center gap-1.5 warm-text font-medium">
                  <Sparkles size={13} className="text-primary" />
                  {subKind === "yearly" ? t.subscribedYearly : subKind === "monthly" ? t.subscribedMonthly : t.subscribedActive}
                </div>
                {profile?.subscription_end_date && (
                  <div className="warm-muted text-[12px] mt-1">
                    {t.nextBillingDate(fmtDate(profile.subscription_end_date))}
                  </div>
                )}
              </div>
            ) : extraCredits > 0 ? (
              <div className="warm-text">{t.extraCredits(extraCredits)}</div>
            ) : (
              <div className="warm-muted">{t.freePlan}</div>
            )}
          </div>
        ) : null}
      </section>

      {/* B. Purchases (logged in only) */}
      {user && (
        <section className="rounded-3xl border border-border/60 bg-card/70 p-5 shadow-[var(--shadow-soft)] mb-4">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0" style={{ background: "var(--gradient-warm)" }}>
              <CreditCard size={18} className="text-primary-foreground" />
            </div>
            <div className="flex-1">
              <h2 className="font-display text-[17px] warm-text leading-tight">{t.purchasesSection}</h2>
            </div>
          </div>

          {purchases.length === 0 ? (
            <p className="text-[12.5px] warm-muted px-1 mb-3">{t.noPurchases}</p>
          ) : (
            <ul className="mb-3 divide-y divide-border/50 rounded-2xl bg-background/60 border border-border/60">
              {purchases.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[12.5px]">
                  <div className="min-w-0">
                    <div className="warm-text truncate">{productLabel(p.product_id)}</div>
                    <div className="warm-muted text-[11px]">{fmtDate(p.created_at)}</div>
                  </div>
                  {p.amount_usd != null && (
                    <div className="warm-muted tabular-nums">${p.amount_usd.toFixed(2)}</div>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setPaywall(true)}
              className="rounded-full py-2.5 text-[12.5px] font-semibold active:scale-[0.98] transition-transform"
              style={{ background: "var(--gradient-warm)", color: "oklch(0.2 0.02 30)" }}
            >
              {t.upgradePlan}
            </button>
            <button
              onClick={handleRestorePurchases}
              className="rounded-full py-2.5 text-[12.5px] font-medium border border-border/70 warm-text bg-background active:scale-[0.98] transition-transform inline-flex items-center justify-center gap-1.5"
            >
              <RefreshCw size={12} />
              {t.restorePurchases}
            </button>
          </div>
        </section>
      )}

      {/* C. Backup */}
      <section className="rounded-3xl border border-border/60 bg-card/70 p-5 shadow-[var(--shadow-soft)] mb-4">
        <div className="flex items-start gap-3 mb-3">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0" style={{ background: "var(--gradient-warm)" }}>
            <Archive size={18} className="text-primary-foreground" />
          </div>
          <div className="flex-1">
            <h2 className="font-display text-[17px] warm-text leading-tight">{t.backupSection}</h2>
            <p className="text-[12px] warm-muted mt-1 leading-relaxed">{t.backupHintManualMove}</p>
          </div>
        </div>

        <div className="space-y-2">
          <button
            onClick={handleExport}
            disabled={exporting}
            className="w-full rounded-2xl bg-background/60 border border-border/60 px-4 py-3 active:scale-[0.99] transition-transform disabled:opacity-60 inline-flex items-center justify-center gap-2 text-[13px] warm-text"
          >
            <Download size={14} />
            {exporting ? t.backupExporting : t.backupDownload}
          </button>

          <button
            onClick={() => fileRef.current?.click()}
            disabled={restoring}
            className="w-full rounded-2xl bg-background/60 border border-border/60 px-4 py-3 active:scale-[0.99] transition-transform disabled:opacity-60 inline-flex items-center justify-center gap-2 text-[13px] warm-text"
          >
            <Upload size={14} />
            {restoring ? t.backupRestoring : t.backupRestore}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".zip,application/zip,application/x-zip-compressed"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleRestoreFile(f);
            }}
          />
        </div>
      </section>

      {/* Notifications (logged in only) */}
      {user && (
        <section className="rounded-3xl border border-border/60 bg-card/70 p-5 shadow-[var(--shadow-soft)]">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0" style={{ background: "var(--gradient-warm)" }}>
              {enabled ? <Bell size={18} className="text-primary-foreground" /> : <BellOff size={18} className="text-primary-foreground" />}
            </div>
            <div className="flex-1">
              <h2 className="font-display text-[17px] warm-text leading-tight">{t.notifSectionTitle}</h2>
              <p className="text-[12.5px] warm-muted mt-1 leading-relaxed">{t.notifSectionDesc}</p>
            </div>
          </div>

          <button
            onClick={toggle}
            disabled={busy || enabled === null}
            className="w-full flex items-center justify-between gap-3 rounded-2xl bg-background/60 border border-border/60 px-4 py-3 active:scale-[0.99] transition-transform disabled:opacity-60"
          >
            <span className="text-[14px] warm-text">{t.notifToggleLabel}</span>
            <span
              className={`inline-flex items-center w-11 h-6 rounded-full transition-colors ${enabled ? "bg-primary" : "bg-muted"}`}
              aria-hidden
            >
              <span className={`block w-5 h-5 rounded-full bg-card shadow transition-transform ${enabled ? "translate-x-[22px]" : "translate-x-[2px]"}`} />
            </span>
          </button>
        </section>
      )}

      <Paywall open={paywall} onClose={() => setPaywall(false)} onSuccess={reloadProfile} />

      <p
        onClick={handleCopyrightTap}
        className="mt-10 mb-2 text-center text-[11px] warm-muted select-none cursor-default"
      >
        © {new Date().getFullYear()} copyright by ince
      </p>
    </div>
  );
}
