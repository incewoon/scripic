import { Gift, X } from "lucide-react";
import { useT } from "@/lib/i18n";

type Props = { open: boolean; onClose: () => void };

const FLAG_KEY = "scripic_welcome_limit_notice_v1";

export function hasSeenWelcomeLimitNotice(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(FLAG_KEY) === "1";
  } catch {
    return true;
  }
}

export function markWelcomeLimitNoticeSeen(): void {
  try {
    localStorage.setItem(FLAG_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function WelcomeLimitDialog({ open, onClose }: Props) {
  const { t } = useT();
  if (!open) return null;

  const close = () => {
    markWelcomeLimitNoticeSeen();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={close}
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
            <Gift size={22} className="text-primary-foreground" />
          </div>
          <button onClick={close} className="p-1.5 text-muted-foreground hover:text-foreground" aria-label="close">
            <X size={18} />
          </button>
        </div>
        <div className="px-6 pb-6">
          <h2 className="font-display text-[22px] warm-text leading-tight mb-3">{t.welcomeLimitTitle}</h2>
          <p className="text-[13.5px] warm-muted leading-relaxed mb-5 whitespace-pre-line">{t.welcomeLimitBody}</p>
          <button
            onClick={close}
            className="w-full text-primary-foreground rounded-full py-3 text-[14.5px] font-medium shadow-[var(--shadow-soft)] active:scale-[0.98] transition-transform"
            style={{ background: "var(--gradient-warm)" }}
          >
            {t.welcomeLimitOk}
          </button>
        </div>
      </div>
    </div>
  );
}
