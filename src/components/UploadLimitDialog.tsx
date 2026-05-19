import { AlertCircle, X } from "lucide-react";
import { useT } from "@/lib/i18n";

type Props = {
  open: boolean;
  onClose: () => void;
  reason: "type" | "size" | null;
};

export function UploadLimitDialog({ open, onClose, reason }: Props) {
  const { t } = useT();
  if (!open || !reason) return null;

  const message = reason === "type" ? t.uploadLimitType : t.uploadLimitSize;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-3xl bg-card border border-border shadow-[var(--shadow-warm)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-6 pb-2 flex items-start justify-between">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{ background: "var(--gradient-warm)" }}
          >
            <AlertCircle size={22} className="text-primary-foreground" />
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-muted-foreground hover:text-foreground"
            aria-label="close"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-6 pb-6">
          <h2 className="font-display text-[22px] warm-text leading-tight mb-2">
            {t.uploadLimitTitle}
          </h2>
          <p className="text-[14px] warm-muted leading-relaxed mb-5">{message}</p>
          <button
            onClick={onClose}
            className="w-full text-primary-foreground rounded-full py-3 text-[14.5px] font-medium shadow-[var(--shadow-soft)] active:scale-[0.98] transition-transform"
            style={{ background: "var(--gradient-warm)" }}
          >
            {t.uploadLimitOk}
          </button>
        </div>
      </div>
    </div>
  );
}
