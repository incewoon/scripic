import { useState } from "react";
import { ShieldCheck, X, ExternalLink } from "lucide-react";
import { useT } from "@/lib/i18n";

export const PRIVACY_POLICY_URL = "https://ai-album-app.web.app/privacy.html";

const SESSION_KEY = "memori_privacy_consent_session";
const DISMISS_KEY = "memori_privacy_consent_dismissed";

export function shouldShowPrivacyConsent(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (localStorage.getItem(DISMISS_KEY) === "1") return false;
    if (sessionStorage.getItem(SESSION_KEY) === "1") return false;
  } catch { /* ignore */ }
  return true;
}

function markSeenForSession() {
  try { sessionStorage.setItem(SESSION_KEY, "1"); } catch { /* ignore */ }
}
function markDismissedForever() {
  try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* ignore */ }
}

type Props = { open: boolean; onClose: () => void };

export function PrivacyConsentDialog({ open, onClose }: Props) {
  const { t } = useT();
  const [dontShow, setDontShow] = useState(false);
  if (!open) return null;

  const close = () => {
    markSeenForSession();
    if (dontShow) markDismissedForever();
    onClose();
  };

  const openPolicy = () => {
    try { window.open(PRIVACY_POLICY_URL, "_blank", "noopener,noreferrer"); } catch { /* ignore */ }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={close}>
      <div
        className="w-full max-w-md rounded-3xl bg-card border border-border shadow-[var(--shadow-warm)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-6 pb-2 flex items-start justify-between">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: "var(--gradient-warm)" }}>
            <ShieldCheck size={22} className="text-primary-foreground" />
          </div>
          <button onClick={close} className="p-1.5 text-muted-foreground hover:text-foreground" aria-label="close">
            <X size={18} />
          </button>
        </div>
        <div className="px-6 pb-6">
          <h2 className="font-display text-[22px] warm-text leading-tight mb-2">
            {t.privacyConsentTitle}
          </h2>
          <p className="text-[14px] warm-muted leading-relaxed mb-4 whitespace-pre-line">
            {t.privacyConsentBody}
          </p>

          <button
            onClick={openPolicy}
            className="w-full mb-3 rounded-2xl bg-background/60 border border-border/60 px-4 py-3 active:scale-[0.99] transition-transform inline-flex items-center justify-center gap-2 text-[13.5px] warm-text"
          >
            <ExternalLink size={14} />
            {t.privacyPolicyView}
          </button>

          <label className="flex items-center gap-2 mb-4 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={dontShow}
              onChange={(e) => setDontShow(e.target.checked)}
              className="w-4 h-4 accent-primary"
            />
            <span className="text-[12.5px] warm-muted">{t.privacyDontShowAgain}</span>
          </label>

          <button
            onClick={close}
            className="w-full text-primary-foreground rounded-full py-3 text-[14.5px] font-medium shadow-[var(--shadow-soft)] active:scale-[0.98] transition-transform"
            style={{ background: "var(--gradient-warm)" }}
          >
            {t.privacyAgreeContinue}
          </button>
        </div>
      </div>
    </div>
  );
}
