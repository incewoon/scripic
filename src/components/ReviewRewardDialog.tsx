import { useState } from "react";
import { Gift, X, Upload, Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { httpsCallable, FunctionsError } from "firebase/functions";
import { getFns } from "@/integrations/firebase/client";
import { ensureFirebaseUser } from "@/integrations/firebase/auth";
import { grantExtraAlbumToday, getDeviceId, getLocalDate } from "@/lib/dailyLimit";

type Props = {
  open: boolean;
  onClose: () => void;
  onGranted?: () => void;
};

type GrantResult = {
  approved: boolean;
  reason?: string;
  success_message?: string;
  daily_limit_info?: string;
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
      await ensureFirebaseUser();
      const call = httpsCallable<any, GrantResult>(getFns(), "grantReviewReward");
      const res = await call({ imageDataUrl: preview, deviceId: getDeviceId(), localDate: getLocalDate() });
      const result = res.data;
      if (result.approved) {
        grantExtraAlbumToday();
        setMessage({ kind: "success", text: result.success_message || t.reviewRewardSuccess });
        onGranted?.();
      } else if (result.daily_limit_info) {
        setMessage({ kind: "info", text: result.daily_limit_info || t.reviewRewardAlreadyUsed });
      } else {
        setMessage({ kind: "error", text: result.reason || t.reviewRewardError });
      }
    } catch (e: any) {
      const kind = (e as any)?.details?.kind;
      if (e instanceof FunctionsError && e.code === "functions/resource-exhausted") {
        if (kind === "ai_quota") {
          setMessage({ kind: "error", text: "AI 서비스의 일일 한도가 모두 사용되었어요. 잠시 후(보통 UTC 자정 = 한국 시간 오전 9시) 다시 시도해주세요." });
        } else {
          setMessage({ kind: "info", text: t.reviewRewardAlreadyUsed });
        }
      } else if (e instanceof FunctionsError && e.code === "functions/failed-precondition") {
        setMessage({ kind: "error", text: "디바이스 인증이 아직 준비되지 않았어요. 잠시 후 다시 시도해 주세요." });
      } else if (e instanceof FunctionsError && e.code === "functions/internal") {
        setMessage({ kind: "error", text: "AI 검증 중 일시 오류가 발생했어요. 잠시 후 다시 시도해 주세요." });
      } else if (e instanceof FunctionsError && (e.code === "functions/not-found" || e.code === "functions/unavailable")) {
        setMessage({ kind: "error", text: "후기 보상 기능이 아직 서버에 배포되지 않았어요. (grantReviewReward 미배포)" });
      } else {
        const msg = String(e?.message ?? "");
        if (/Failed to fetch|NetworkError|load failed|404/i.test(msg)) {
          setMessage({
            kind: "error",
            text: "서버의 후기 보상 함수에 연결하지 못했어요. 함수가 아직 배포되지 않았거나 네트워크 문제일 수 있어요.",
          });
        } else {
          setMessage({ kind: "error", text: t.reviewRewardError });
        }
      }
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
