import { useState } from "react";
import { MessageCircle, X, Sparkles, Mic } from "lucide-react";
import { useT } from "@/lib/i18n";

const SESSION_KEY = "memori_chat_usage_session";
const DISMISS_KEY = "memori_chat_usage_dismissed";

export function shouldShowChatUsage(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (localStorage.getItem(DISMISS_KEY) === "1") return false;
    if (sessionStorage.getItem(SESSION_KEY) === "1") return false;
  } catch {
    /* ignore */
  }
  return true;
}

function markSeenForSession() {
  try {
    sessionStorage.setItem(SESSION_KEY, "1");
  } catch {
    /* ignore */
  }
}
function markDismissedForever() {
  try {
    localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    /* ignore */
  }
}

type Props = { open: boolean; onClose: () => void };

export function ChatUsageDialog({ open, onClose }: Props) {
  const { t } = useT();
  const [dontShow, setDontShow] = useState(false);
  if (!open) return null;

  const close = () => {
    markSeenForSession();
    if (dontShow) markDismissedForever();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4"
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
            <MessageCircle size={22} className="text-primary-foreground" />
          </div>
          <button onClick={close} className="p-1.5 text-muted-foreground hover:text-foreground" aria-label="close">
            <X size={18} />
          </button>
        </div>
        <div className="px-6 pb-6">
          <h2 className="font-display text-[22px] warm-text leading-tight mb-4">{t.chatUsageTitle}</h2>
          <p className="text-[13.5px] warm-muted leading-relaxed mb-4">{t.chatUsageIntro}</p>

          <ul className="space-y-3 mb-5">
            <li className="flex gap-3">
              <span className="mt-0.5 flex-shrink-0 w-7 h-7 rounded-full bg-background/70 border border-border/60 flex items-center justify-center">
                <MessageCircle size={14} className="warm-text" />
              </span>
              <p className="text-[13px] warm-muted leading-relaxed">{t.chatUsageTurns}</p>
            </li>
            <li className="flex gap-3">
              <span className="mt-0.5 flex-shrink-0 w-7 h-7 rounded-full bg-background/70 border border-border/60 flex items-center justify-center">
                <Sparkles size={14} className="warm-text" />
              </span>
              <p className="text-[13px] warm-muted leading-relaxed">{t.chatUsageFinish}</p>
            </li>
            <li className="flex gap-3">
              <span className="mt-0.5 flex-shrink-0 w-7 h-7 rounded-full bg-background/70 border border-border/60 flex items-center justify-center">
                <Mic size={14} className="warm-text" />
              </span>
              <p className="text-[13px] warm-muted leading-relaxed">{t.chatUsageMic}</p>
            </li>
          </ul>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={dontShow}
              onChange={(e) => setDontShow(e.target.checked)}
              className="w-4 h-4 accent-primary"
            />
            <span className="text-[12.5px] warm-muted">{t.dontShowNextTime}</span>
          </label>

          
        </div>
      </div>
    </div>
  );
}
