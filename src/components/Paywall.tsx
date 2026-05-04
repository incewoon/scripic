import { useState } from "react";
import { X, Sparkles, Check } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { PRODUCTS, type ProductId } from "@/lib/premium";
import { purchase } from "@/lib/billing";

export function Paywall({ open, onClose, onSuccess }: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { t, lang } = useT();
  const [busy, setBusy] = useState<ProductId | null>(null);

  if (!open) return null;

  const handleBuy = async (id: ProductId) => {
    setBusy(id);
    try {
      await purchase(id);
      toast.success(t.purchaseSuccess);
      onSuccess();
      onClose();
    } catch (e: any) {
      console.error(e);
      toast.error(t.purchaseFailed);
    } finally {
      setBusy(null);
    }
  };

  const fmtPrice = (p: typeof PRODUCTS[ProductId]) => {
    const usd = `$${p.priceUsd.toFixed(2)}`;
    const krw = `₩${p.priceKrw.toLocaleString()}`;
    const per = lang === "ko" ? p.perKo : p.perEn;
    return { main: lang === "ko" ? krw : usd, alt: lang === "ko" ? usd : krw, per };
  };

  const yearlyMonthlyEquiv = lang === "ko"
    ? `₩${Math.round(PRODUCTS.sub_yearly.priceKrw / 12).toLocaleString()}`
    : `$${(PRODUCTS.sub_yearly.priceUsd / 12).toFixed(2)}`;

  const cards: { id: ProductId; lines: string[] }[] = [
    { id: "credits_10", lines: [lang === "ko" ? "앨범 10개 추가 저장" : "Save 10 more albums", lang === "ko" ? "일회성 결제" : "One-time payment"] },
    { id: "sub_monthly", lines: [lang === "ko" ? "무제한 앨범 생성" : "Unlimited albums", lang === "ko" ? "언제든 해지 가능" : "Cancel anytime"] },
    { id: "sub_yearly", lines: [lang === "ko" ? "무제한 앨범 생성" : "Unlimited albums", t.perMonthEquiv(yearlyMonthlyEquiv)] },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full sm:max-w-md max-h-[92dvh] overflow-y-auto bg-background rounded-t-[28px] sm:rounded-[28px] border border-border/60 shadow-2xl p-6 pb-[max(env(safe-area-inset-bottom),1.5rem)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "var(--gradient-warm)" }}>
              <Sparkles size={16} className="text-primary-foreground" />
            </div>
            <div>
              <h2 className="font-display text-[22px] warm-text leading-tight">{t.paywallTitle}</h2>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 -mr-1 -mt-1 text-muted-foreground hover:text-foreground">
            <X size={20} />
          </button>
        </div>
        <p className="text-[13.5px] warm-muted leading-relaxed mb-5">{t.paywallSubtitle}</p>

        <div className="space-y-3">
          {cards.map(({ id, lines }) => {
            const p = PRODUCTS[id];
            const isYearly = id === "sub_yearly";
            const price = fmtPrice(p);
            return (
              <div
                key={id}
                className={`relative rounded-2xl p-4 border ${isYearly ? "border-primary/60" : "border-border/60"} bg-card`}
                style={isYearly ? { boxShadow: "var(--shadow-warm)" } : undefined}
              >
                {isYearly && (
                  <div className="absolute -top-2.5 right-4 text-[10px] font-semibold text-primary-foreground px-2.5 py-1 rounded-full" style={{ background: "var(--gradient-warm)" }}>
                    {t.bestValue}
                  </div>
                )}
                <div className="flex items-baseline justify-between mb-2">
                  <h3 className="font-display text-[17px] warm-text">{lang === "ko" ? p.titleKo : p.titleEn}</h3>
                  <div className="text-right">
                    <div className="font-display text-[20px] warm-text leading-none">
                      {price.main}<span className="text-[12px] warm-muted font-sans">{price.per ?? ""}</span>
                    </div>
                    <div className="text-[10.5px] warm-muted mt-0.5">{price.alt}{price.per ?? ""}</div>
                  </div>
                </div>
                <ul className="space-y-1 mb-3">
                  {lines.map((l) => (
                    <li key={l} className="flex items-center gap-1.5 text-[12.5px] warm-muted">
                      <Check size={13} className="text-primary flex-shrink-0" />{l}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => handleBuy(id)}
                  disabled={busy !== null}
                  className={`w-full rounded-full py-2.5 text-[13px] font-medium active:scale-[0.98] transition-transform disabled:opacity-50 ${
                    isYearly ? "text-primary-foreground" : "border border-border/70 warm-text bg-background"
                  }`}
                  style={isYearly ? { background: "var(--gradient-warm)" } : undefined}
                >
                  {busy === id ? t.purchasing : t.payWithGoogle}
                </button>
              </div>
            );
          })}
        </div>

        <button onClick={onClose} className="w-full text-center text-[12.5px] warm-muted mt-4 py-2">
          {t.laterCta}
        </button>
      </div>
    </div>
  );
}
