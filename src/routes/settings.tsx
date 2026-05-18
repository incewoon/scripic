import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, Archive, Download, Upload, Palette, Check, Database, Smartphone, Lock, ListOrdered, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { useTheme, type Theme } from "@/lib/theme";
import { exportBackupZip, importBackupZip } from "@/lib/backup";
import { getStorageDiagnostics, requestPersistentStorage } from "@/lib/storage";
import { BackupPinDialog } from "@/components/BackupPinDialog";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
  head: () => ({
    meta: [
      { title: "Settings — Rementory" },
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
  const [diag, setDiag] = useState<{ origin: string; persisted: boolean; usage: number; quota: number } | null>(null);

  const refreshDiag = () => { getStorageDiagnostics().then(setDiag); };
  useEffect(() => { refreshDiag(); }, []);

  const onPersistRequest = async () => {
    const ok = await requestPersistentStorage();
    refreshDiag();
    if (ok) toast.success(t.storageDiagPersistGranted);
    else toast.error(t.storageDiagPersistDenied);
  };
  const fmtBytes = (n: number) => {
    if (!n) return "0 B";
    const u = ["B", "KB", "MB", "GB"];
    let i = 0; let v = n;
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${u[i]}`;
  };

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

        <div className="rounded-2xl border border-border/40 bg-background/40 p-3 mb-3 space-y-3">
          <div className="flex items-start gap-2.5">
            <Smartphone size={14} className="mt-0.5 shrink-0 warm-text" />
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-medium warm-text leading-tight">{t.backupInfoDeviceTitle}</p>
              <p className="text-[11px] warm-muted mt-1 leading-relaxed">{t.backupInfoDeviceBody}</p>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <Lock size={14} className="mt-0.5 shrink-0 warm-text" />
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-medium warm-text leading-tight">{t.backupInfoPinTitle}</p>
              <p className="text-[11px] warm-muted mt-1 leading-relaxed">{t.backupInfoPinBody}</p>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <ListOrdered size={14} className="mt-0.5 shrink-0 warm-text" />
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-medium warm-text leading-tight">{t.backupInfoStepsTitle}</p>
              <ol className="text-[11px] warm-muted mt-1 leading-relaxed list-decimal list-inside space-y-0.5">
                <li>{t.backupInfoStep1}</li>
                <li>{t.backupInfoStep2}</li>
                <li>{t.backupInfoStep3}</li>
              </ol>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <AlertTriangle size={14} className="mt-0.5 shrink-0 warm-text" />
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-medium warm-text leading-tight">{t.backupInfoWarnTitle}</p>
              <p className="text-[11px] warm-muted mt-1 leading-relaxed">{t.backupInfoWarnBody}</p>
            </div>
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
            accept=".mwbak,.moarabak,.zip,application/zip,application/x-zip-compressed"
            className="hidden"
            onChange={onFileChosen}
          />
        </div>
      </section>

      {/* Storage diagnostics */}
      <section className="rounded-3xl border border-border/60 bg-card/70 p-5 shadow-[var(--shadow-soft)] mb-4">
        <div className="flex items-start gap-3 mb-3">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0" style={{ background: "var(--gradient-warm)" }}>
            <Database size={18} className="text-primary-foreground" />
          </div>
          <div className="flex-1">
            <h2 className="font-display text-[17px] warm-text leading-tight">{t.storageDiagSection}</h2>
            <p className="text-[12px] warm-muted mt-1 leading-relaxed">{t.storageDiagDesc}</p>
          </div>
        </div>

        <dl className="space-y-2 text-[12.5px] mb-3">
          <div className="flex items-start justify-between gap-3 rounded-xl bg-background/60 border border-border/60 px-3 py-2">
            <dt className="warm-muted shrink-0">{t.storageDiagOrigin}</dt>
            <dd className="warm-text text-right break-all font-mono text-[11px]">{diag?.origin ?? "—"}</dd>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl bg-background/60 border border-border/60 px-3 py-2">
            <dt className="warm-muted shrink-0">{t.storageDiagPersisted}</dt>
            <dd className={`text-right text-[11.5px] ${diag?.persisted ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
              {diag === null ? "—" : diag.persisted ? t.storageDiagPersistedYes : t.storageDiagPersistedNo}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl bg-background/60 border border-border/60 px-3 py-2">
            <dt className="warm-muted shrink-0">{t.storageDiagUsage}</dt>
            <dd className="warm-text text-right tabular-nums">
              {diag ? `${fmtBytes(diag.usage)} / ${fmtBytes(diag.quota)}` : "—"}
            </dd>
          </div>
        </dl>

        {!diag?.persisted && (
          <button
            onClick={onPersistRequest}
            className="w-full rounded-2xl bg-background/60 border border-border/60 px-4 py-3 active:scale-[0.99] transition-transform inline-flex items-center justify-center gap-2 text-[13px] warm-text"
          >
            {t.storageDiagPersistBtn}
          </button>
        )}
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
