import { useState } from "react";
import { ShieldCheck, X, ExternalLink } from "lucide-react";
import { useT } from "@/lib/i18n";
import { PRIVACY_POLICY_URL } from "@/lib/legal";

type Props = { open: boolean; onClose: () => void };

const DISMISS_KEY = "memori_storage_notice_dismissed_v3";
const SESSION_KEY = "memori_storage_notice_session_v3";

export function hasSeenStorageNotice(): boolean {
  if (typeof window === "undefined") return true;
  try {
    if (localStorage.getItem(DISMISS_KEY) === "1") return true;
    if (sessionStorage.getItem(SESSION_KEY) === "1") return true;
  } catch {
    /* ignore */
  }
  return false;
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

export function StorageNoticeDialog({ open, onClose }: Props) {
  const { t } = useT();
  if (!open) return null;

  const close = () => {
    markDismissedForever();
    onClose();
  };

  const openPolicy = () => {
    try {
      window.open(PRIVACY_POLICY_URL, "_blank", "noopener,noreferrer");
    } catch {
      /* ignore */
    }
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
            <ShieldCheck size={22} className="text-primary-foreground" />
          </div>
          <button onClick={close} className="p-1.5 text-muted-foreground hover:text-foreground" aria-label="close">
            <X size={18} />
          </button>
        </div>
        <div className="px-6 pb-6">
          <h2 className="font-display text-[22px] warm-text leading-tight mb-3">{t.storageNoticeTitle}</h2>

          <p className="text-[13.5px] warm-muted leading-relaxed mb-3 whitespace-pre-line">{t.privacyConsentBody}</p>

          <button
            onClick={openPolicy}
            className="w-full mb-4 rounded-2xl bg-background/60 border border-border/60 px-4 py-3 active:scale-[0.99] transition-transform inline-flex items-center justify-center gap-2 text-[13px] warm-text"
          >
            <ExternalLink size={14} />
            {t.privacyPolicyView}
          </button>

          <div className="mb-5 px-3 py-3 rounded-xl bg-background/60 border border-border/60">
            <h3 className="text-[13px] font-semibold warm-text mb-1">{t.freeNoticeTitle}</h3>
            <p className="text-[12px] warm-muted leading-relaxed mb-1.5 hitespace-pre-line">{t.freeNoticeBody}</p>
            <p className="text-[12px] warm-muted leading-relaxed whitespace-pre-line">{t.freeNoticeSoon}</p>
          </div>

          <button
            onClick={close}
            className="w-full text-primary-foreground rounded-full py-3 text-[14.5px] font-medium shadow-[var(--shadow-soft)] active:scale-[0.98] transition-transform"
            style={{ background: "var(--gradient-warm)" }}
          >
            {t.gotIt}
          </button>
        </div>
      </div>
    </div>
  );
}
