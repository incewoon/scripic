import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronLeft, Bell, BellOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { requestNotificationPermission, openAppSettings } from "@/lib/native";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
  head: () => ({
    meta: [
      { title: "Settings — memori" },
      { name: "description", content: "Manage your memori preferences and reminders." },
    ],
  }),
});

function SettingsPage() {
  const { t } = useT();
  const { user, loading } = useAuth();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!user) { setEnabled(null); return; }
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("notifications_enabled")
        .maybeSingle();
      if (!cancelled) setEnabled(Boolean(data?.notifications_enabled));
    })();
    return () => { cancelled = true; };
  }, [user]);

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

  return (
    <div className="mx-auto max-w-md min-h-screen px-5 pt-10 pb-20">
      <div className="mb-8 flex items-center gap-2">
        <Link to="/" className="p-2 -ml-2 text-muted-foreground hover:text-foreground" aria-label={t.backHome}>
          <ChevronLeft size={20} />
        </Link>
        <h1 className="font-display text-[26px] warm-text leading-none">{t.settings}</h1>
      </div>

      {!user && !loading ? (
        <div className="rounded-2xl border border-border/60 bg-card/60 p-5 text-center">
          <p className="text-[13px] warm-muted mb-3">{t.authIntro}</p>
          <Link to="/auth" className="inline-block rounded-full px-5 py-2 text-[13px] font-medium text-primary-foreground" style={{ background: "var(--gradient-warm)" }}>
            {t.signIn}
          </Link>
        </div>
      ) : (
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
    </div>
  );
}
