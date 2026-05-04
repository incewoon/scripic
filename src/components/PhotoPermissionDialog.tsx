import { useState } from "react";
import { Camera, X } from "lucide-react";
import { requestPhotoPermission, openAppSettings } from "@/lib/native";
import { useT } from "@/lib/i18n";

type Props = {
  open: boolean;
  onClose: () => void;
  onGranted?: () => void;
};

const SEEN_KEY = "memori_photo_perm_asked_v1";

export function hasAskedPhotoPermission(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(SEEN_KEY) === "1";
}
export function markPhotoPermissionAsked() {
  try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* ignore */ }
}

export function PhotoPermissionDialog({ open, onClose, onGranted }: Props) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);

  if (!open) return null;

  const onAllow = async () => {
    setBusy(true);
    const r = await requestPhotoPermission();
    setBusy(false);
    markPhotoPermissionAsked();
    if (r === "granted") {
      onGranted?.();
      onClose();
    } else {
      setDenied(true);
    }
  };

  const onSkip = () => {
    markPhotoPermissionAsked();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-3xl bg-card border border-border shadow-[var(--shadow-warm)] overflow-hidden">
        <div className="px-6 pt-6 pb-2 flex items-start justify-between">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: "var(--gradient-warm)" }}>
            <Camera size={22} className="text-primary-foreground" />
          </div>
          <button onClick={onSkip} className="p-1.5 text-muted-foreground hover:text-foreground" aria-label="close">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 pb-6">
          <h2 className="font-display text-[22px] warm-text leading-tight mb-2">
            {t.photoPermTitle}
          </h2>
          <p className="text-[14px] warm-muted leading-relaxed mb-5">
            {t.photoPermDesc}
          </p>

          {denied ? (
            <div className="rounded-2xl bg-muted/60 px-4 py-3 mb-4">
              <p className="text-[12.5px] warm-muted mb-2">{t.photoPermDeniedHint}</p>
              <button
                onClick={() => { openAppSettings(); onClose(); }}
                className="text-[12.5px] font-medium text-primary underline underline-offset-2"
              >
                {t.openSettings}
              </button>
            </div>
          ) : null}

          <div className="flex flex-col gap-2">
            <button
              onClick={onAllow}
              disabled={busy}
              className="w-full text-primary-foreground rounded-full py-3 text-[14.5px] font-medium shadow-[var(--shadow-soft)] active:scale-[0.98] transition-transform disabled:opacity-60"
              style={{ background: "var(--gradient-warm)" }}
            >
              {busy ? t.processing : t.photoPermAllow}
            </button>
            <button
              onClick={onSkip}
              className="w-full text-[13px] warm-muted py-2"
            >
              {t.laterCta}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
