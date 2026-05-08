import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { ChevronLeft, Archive, Download, Upload, Palette, Check } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { useTheme, type Theme } from "@/lib/theme";
import { exportBackupZip, importBackupZip } from "@/lib/backup";
import { BackupPinDialog } from "@/components/BackupPinDialog";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
  head: () => ({
    meta: [
      { title: "Settings — Moara" },
      { name: "description", content: "Theme and album backup settings." },
    ],
  }),
});

const THEME_PREVIEWS: Record<Theme, { bg: string; swatch1: string; swatch2: string; swatch3: string }> = {
  warm: {
    bg: "linear-gradient(135deg, oklch(0.97 0.045 55), oklch(0.94 0.04 340))",
    swatch1: "oklch(0.74 0.11 25)", swatch2: "oklch(0.87 0.09 50)", swatch3: "oklch(0.99 0.014 75)",
  },
  midnight: {
    bg: "linear-gradient(135deg, oklch(0.22 0.03 260), oklch(0.18 0.025 250))",
    swatch1: "oklch(0.80 0.13 78)", swatch2: "oklch(0.26 0.03 260)", swatch3: "oklch(0.94 0.015 80)",
  },
  linen: {
    bg: "linear-gradient(135deg, oklch(0.98 0.008 95), oklch(0.96 0.012 100))",
    swatch1: "oklch(0.42 0.10 250)", swatch2: "oklch(0.86 0.04 240)", swatch3: "oklch(0.995 0.004 95)",
  },
};

function SettingsPage() {
  const { t } = useT();
  const [theme, setTheme] = useTheme();
  const [exporting, setExporting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [pinMode, setPinMode] = useState<"export" | "import" | null>(null);
  const pendingFileRef = useRef<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const tapCountRef = useRef(0);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigate = useNavigate();

  const handleCopyrightTap = () => {
    tapCountRef.current += 1;
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    tapTimerRef.current = setTimeout(() => { tapCountRef.current = 0; }, 1500);
    if (tapCountRef.current >= 7) {
      tapCountRef.current = 0;
      if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
      navigate({ to: "/easter" });
    }
  };

  const onExport = () => setPinMode("export");
  const onPickRestoreFile = () => fileRef.current?.click();
  const onFileChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    pendingFileRef.current = f;
    setPinMode("import");
    if (fileRef.current) fileRef.current.value = "";
  };

  const submitPin = async (pin: string) => {
    if (pinMode === "export") {
      setExporting(true);
      try { await exportBackupZip(pin); toast.success(t.saved); }
      catch { toast.error(t.failed); }
      finally { setExporting(false); setPinMode(null); }
    } else if (pinMode === "import") {
      const file = pendingFileRef.current;
      if (!file) { setPinMode(null); return; }
      setRestoring(true);
      try {
        const r = await importBackupZip(file, pin);
        if (!r.ok) {
          if (r.reason === "wrong_password") toast.error(t.backupPinWrong);
          else toast.error(t.backupInvalid);
          return;
        }
        toast.success(t.backupDone(r.imported));
        setPinMode(null);
      } catch { toast.error(t.backupInvalid); }
      finally { setRestoring(false); pendingFileRef.current = null; }
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

      {/* Theme picker */}
      <section className="rounded-3xl border border-border/60 bg-card/70 p-5 shadow-[var(--shadow-soft)] mb-4">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0" style={{ background: "var(--gradient-warm)" }}>
            <Palette size={18} className="text-primary-foreground" />
          </div>
          <div className="flex-1">
            <h2 className="font-display text-[17px] warm-text leading-tight">{t.themeSection}</h2>
            <p className="text-[12.5px] warm-muted mt-1 leading-relaxed">{t.themeSectionDesc}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2">
          {(["warm", "midnight", "linen"] as const).map((id) => {
            const selected = theme === id;
            const meta = THEME_PREVIEWS[id];
            const label = id === "warm" ? t.themeWarm : id === "midnight" ? t.themeMidnight : t.themeLinen;
            const desc = id === "warm" ? t.themeWarmDesc : id === "midnight" ? t.themeMidnightDesc : t.themeLinenDesc;
            return (
              <button
                key={id}
                type="button"
                onClick={() => { if (selected) return; setTheme(id as Theme); toast.success(t.themeChanged); }}
                className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-all active:scale-[0.99] ${
                  selected ? "border-primary/70 bg-background/80 shadow-[var(--shadow-soft)]" : "border-border/60 bg-background/50 hover:bg-background/70"
                }`}
                aria-pressed={selected}
              >
                <div className="flex shrink-0 items-center justify-center rounded-xl border border-border/60 p-1.5" style={{ background: meta.bg }}>
                  <span className="flex gap-1">
                    <span className="block w-3 h-6 rounded-sm" style={{ background: meta.swatch1 }} />
                    <span className="block w-3 h-6 rounded-sm" style={{ background: meta.swatch2 }} />
                    <span className="block w-3 h-6 rounded-sm" style={{ background: meta.swatch3 }} />
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] warm-text font-medium leading-tight">{label}</div>
                  <div className="text-[11.5px] warm-muted mt-0.5 leading-snug">{desc}</div>
                </div>
                {selected && (
                  <div className="shrink-0 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                    <Check size={14} className="text-primary-foreground" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* Backup */}
      <section className="rounded-3xl border border-border/60 bg-card/70 p-5 shadow-[var(--shadow-soft)] mb-4">
        <div className="flex items-start gap-3 mb-3">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0" style={{ background: "var(--gradient-warm)" }}>
            <Archive size={18} className="text-primary-foreground" />
          </div>
          <div className="flex-1">
            <h2 className="font-display text-[17px] warm-text leading-tight">{t.backupSection}</h2>
            <p className="text-[12px] warm-muted mt-1 leading-relaxed">{t.backupPinHint}</p>
          </div>
        </div>

        <div className="space-y-2">
          <button
            onClick={onExport}
            disabled={exporting}
            className="w-full rounded-2xl bg-background/60 border border-border/60 px-4 py-3 active:scale-[0.99] transition-transform disabled:opacity-60 inline-flex items-center justify-center gap-2 text-[13px] warm-text"
          >
            <Download size={14} />
            {exporting ? t.backupExporting : t.backupDownload}
          </button>

          <button
            onClick={onPickRestoreFile}
            disabled={restoring}
            className="w-full rounded-2xl bg-background/60 border border-border/60 px-4 py-3 active:scale-[0.99] transition-transform disabled:opacity-60 inline-flex items-center justify-center gap-2 text-[13px] warm-text"
          >
            <Upload size={14} />
            {restoring ? t.backupRestoring : t.backupRestore}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".moarabak,.zip,application/zip,application/x-zip-compressed"
            className="hidden"
            onChange={onFileChosen}
          />
        </div>
      </section>

      <BackupPinDialog
        open={pinMode !== null}
        mode={pinMode ?? "export"}
        busy={exporting || restoring}
        onClose={() => { setPinMode(null); pendingFileRef.current = null; }}
        onSubmit={submitPin}
      />

      <p className="mt-10 mb-2 text-center text-[11px] warm-muted select-none">
        Copyright 2026.{" "}
        <span onClick={handleCopyrightTap} className="text-inherit no-underline cursor-default">ince</span>
        . All rights reserved.
      </p>
    </div>
  );
}
