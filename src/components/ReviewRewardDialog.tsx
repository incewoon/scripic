import { useState } from "react";
import { Gift, X, Upload, Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useServerFn } from "@tanstack/react-start";
import { verifyReviewScreenshot } from "@/lib/reviewReward.functions";
import { grantExtraAlbumToday } from "@/lib/dailyLimit";
import { ensureFirebaseUser } from "@/integrations/firebase/auth";

type Props = {
  open: boolean;
  onClose: () => void;
  onGranted?: () => void;
};

async function fileToResizedDataUrl(file: File, maxDim = 1280, quality = 0.82): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bmp, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", quality);
}

export function ReviewRewardDialog({ open, onClose, onGranted }: Props) {
  const { t } = useT();
  const verify = useServerFn(verifyReviewScreenshot);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error" | "info"; text: string } | null>(null);

  if (!open) return null;

  const close = () => {
    if (busy) return;
    setPreview(null);
    setMessage(null);
    onClose();
  };

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setMessage(null);
    try {
      const dataUrl = await fileToResizedDataUrl(file);
      setPreview(dataUrl);
    } catch {
      setMessage({ kind: "error", text: t.reviewRewardError });
    }
  };

  const onSubmit = async () => {
    if (!preview || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const user = await ensureFirebaseUser();
      const idToken = await user.getIdToken();
      const result = await verify({
        data: { idToken, imageDataUrl: preview },
      });
      if (result.approved) {
        grantExtraAlbumToday();
        setMessage({ kind: "success", text: result.success_message || t.reviewRewardSuccess });
        onGranted?.();
      } else if (result.daily_limit_info) {
        setMessage({ kind: "info", text: result.daily_limit_info || t.reviewRewardAlreadyUsed });
      } else {
        setMessage({ kind: "error", text: result.reason || t.reviewRewardError });
      }
    } catch {
      setMessage({ kind: "error", text: t.reviewRewardError });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={close}>
      <div
        className="w-full max-w-md rounded-3xl bg-card border border-border shadow-[var(--shadow-warm)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-6 pb-2 flex items-start justify-between">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: "var(--gradient-warm)" }}>
            <Gift size={22} className="text-primary-foreground" />
          </div>
          <button onClick={close} disabled={busy} className="p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-50" aria-label="close">
            <X size={18} />
          </button>
        </div>
        <div className="px-6 pb-6">
          <h2 className="font-display text-[22px] warm-text leading-tight mb-2">{t.reviewRewardTitle}</h2>
          <p className="text-[13px] warm-muted leading-relaxed mb-4">{t.reviewRewardDesc}</p>

          {preview ? (
            <div className="mb-4 rounded-2xl overflow-hidden border border-border/60 bg-background/40">
              <img src={preview} alt="review preview" className="w-full max-h-72 object-contain" />
            </div>
          ) : null}

          {message && (
            <div
              className={`mb-4 px-3 py-2.5 rounded-xl text-[13px] leading-relaxed border ${
                message.kind === "success"
                  ? "bg-primary/10 border-primary/30 warm-text"
                  : message.kind === "info"
                  ? "bg-background/60 border-border/60 warm-muted"
                  : "bg-destructive/10 border-destructive/30 text-destructive"
              }`}
            >
              {message.text}
            </div>
          )}

          {message?.kind === "success" ? (
            <button
              onClick={close}
              className="w-full text-primary-foreground rounded-full py-3 text-[14.5px] font-medium shadow-[var(--shadow-soft)] active:scale-[0.98] transition-transform"
              style={{ background: "var(--gradient-warm)" }}
            >
              {t.okay}
            </button>
          ) : (
            <div className="flex flex-col gap-2">
              <label className="w-full inline-flex items-center justify-center gap-2 rounded-full border border-border bg-background/60 py-3 text-[14px] font-medium warm-text cursor-pointer active:scale-[0.98] transition-transform">
                <Upload size={16} />
                {preview ? t.reviewRewardPickImage : t.reviewRewardPickImage}
                <input type="file" accept="image/*" className="hidden" onChange={onPick} disabled={busy} />
              </label>
              <button
                onClick={onSubmit}
                disabled={!preview || busy}
                className="w-full text-primary-foreground rounded-full py-3 text-[14.5px] font-medium shadow-[var(--shadow-soft)] active:scale-[0.98] transition-transform disabled:opacity-50 inline-flex items-center justify-center gap-2"
                style={{ background: "var(--gradient-warm)" }}
              >
                {busy ? <><Loader2 size={16} className="animate-spin" /> {t.reviewRewardChecking}</> : t.reviewRewardSubmit}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
