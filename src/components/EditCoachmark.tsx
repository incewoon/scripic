import { useEffect, useState, type RefObject } from "react";
import { useT } from "@/lib/i18n";

type Rect = { top: number; left: number; width: number; height: number };

function readRect(el: HTMLElement | null): Rect | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

/**
 * Full-screen one-time coachmark that dims the screen and cuts spotlight
 * holes around the given target refs (edit pencil + location chip),
 * showing a short hint. Tap anywhere or the OK button to dismiss.
 */
export function EditCoachmark({
  open,
  onClose,
  targets,
}: {
  open: boolean;
  onClose: () => void;
  targets: RefObject<HTMLElement | null>[];
}) {
  const { t } = useT();
  const [rects, setRects] = useState<Rect[]>([]);

  useEffect(() => {
    if (!open) return;
    const measure = () => {
      const next = targets.map((r) => readRect(r.current)).filter(Boolean) as Rect[];
      setRects(next);
    };
    // Delay one frame so layout is settled.
    const raf = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, targets]);

  if (!open) return null;

  const pad = 8;

  return (
    <div
      className="fixed inset-0 z-[60]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      {/* SVG mask: dark overlay with spotlight cutouts */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden>
        <defs>
          <mask id="coach-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {rects.map((r, i) => (
              <rect
                key={i}
                x={Math.max(0, r.left - pad)}
                y={Math.max(0, r.top - pad)}
                width={r.width + pad * 2}
                height={r.height + pad * 2}
                rx={Math.min(24, (r.height + pad * 2) / 2)}
                ry={Math.min(24, (r.height + pad * 2) / 2)}
                fill="black"
              />
            ))}
          </mask>
        </defs>
        <rect x="0" y="0" width="100%" height="100%" fill="rgba(0,0,0,0.62)" mask="url(#coach-mask)" />
      </svg>

      {/* Pulsing highlight rings around each target */}
      {rects.map((r, i) => (
        <div
          key={i}
          className="pointer-events-none absolute rounded-full ring-2 ring-primary/90 animate-pulse"
          style={{
            top: Math.max(0, r.top - pad),
            left: Math.max(0, r.left - pad),
            width: r.width + pad * 2,
            height: r.height + pad * 2,
            borderRadius: Math.min(24, (r.height + pad * 2) / 2),
          }}
        />
      ))}

      {/* Hint card */}
      <div className="absolute inset-x-0 bottom-12 flex justify-center px-6">
        <div
          className="max-w-sm w-full rounded-2xl bg-card text-card-foreground shadow-xl px-5 py-4 text-center"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="font-display text-base mb-1">{t.editCoachTitle}</p>
          <p className="text-sm warm-muted leading-relaxed">{t.editCoachBody}</p>
          <button
            onClick={onClose}
            className="mt-4 inline-flex items-center justify-center rounded-full px-5 py-2 text-[13px] text-primary-foreground active:scale-[0.98] transition-transform"
            style={{ background: "var(--gradient-warm)" }}
          >
            {t.editCoachOk}
          </button>
        </div>
      </div>
    </div>
  );
}
