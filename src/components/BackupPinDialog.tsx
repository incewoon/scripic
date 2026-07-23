import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useT } from "@/lib/i18n";

type Mode = "export" | "import";

export function BackupPinDialog({
  open, mode, busy, onClose, onSubmit,
}: {
  open: boolean;
  mode: Mode;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (pin: string) => void;
}) {
  const { t } = useT();
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) { setPin(""); setConfirm(""); setErr(null); setTimeout(() => ref.current?.focus(), 50); }
  }, [open]);

  if (!open) return null;

  const submit = () => {
    if (!/^\d{4}$/.test(pin)) { setErr(t.backupPinFormat); return; }
    if (mode === "export" && pin !== confirm) { setErr(t.backupPinMismatch); return; }
    onSubmit(pin);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full sm:max-w-sm bg-background rounded-t-[28px] sm:rounded-[28px] border border-border/60 shadow-2xl p-6 pb-[max(env(safe-area-inset-bottom),1.5rem)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-3">
          <h2 className="font-display text-[19px] warm-text leading-tight">
            {mode === "import" ? t.backupPinTitleImport : t.backupPinTitle}
          </h2>
          <button onClick={onClose} className="p-1.5 -mr-1 -mt-1 text-muted-foreground hover:text-foreground"><X size={18} /></button>
        </div>
        <p className="text-[12.5px] warm-muted leading-relaxed mb-4">
          {mode === "import" ? t.backupPinHintImport : t.backupPinHint}
        </p>

        <input
          ref={ref}
          inputMode="numeric"
          pattern="\d{4}"
          maxLength={4}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
          placeholder="••••"
          className="w-full text-center tracking-[0.5em] text-[22px] font-display bg-card border border-border/60 rounded-2xl px-4 py-3 outline-none focus:border-primary/60 mb-2"
        />
        {mode === "export" && (
          <input
            inputMode="numeric"
            pattern="\d{4}"
            maxLength={4}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder={t.backupPinConfirm}
            className="w-full text-center tracking-[0.5em] text-[22px] font-display bg-card border border-border/60 rounded-2xl px-4 py-3 outline-none focus:border-primary/60"
          />
        )}
        {err && <div className="mt-2 text-[12px] text-destructive">{err}</div>}

        <button
          onClick={submit}
          disabled={busy}
          className="mt-4 w-full text-primary-foreground rounded-full py-3 text-[14px] font-medium active:scale-[0.98] transition-transform disabled:opacity-60"
          style={{ background: "var(--gradient-warm)" }}
        >
          {busy ? "…" : mode === "export" ? t.backupDownload : t.backupRestore}
        </button>
      </div>
    </div>
  );
}
