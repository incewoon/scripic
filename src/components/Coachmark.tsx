import { useEffect, useLayoutEffect, useState, type RefObject } from "react";
import { X } from "lucide-react";
import { useT } from "@/lib/i18n";

type Rect = { top: number; left: number; width: number; height: number };

export type CoachStep = {
  target?: RefObject<HTMLElement | null>;
  title: string;
  body: string;
  /** 'auto' picks top/bottom based on target position. */
  placement?: "auto" | "top" | "bottom" | "center";
};

type Props = {
  open: boolean;
  steps: CoachStep[];
  onClose: () => void;
};

function readRect(el: HTMLElement | null): Rect | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

export function Coachmark({ open, steps, onClose }: Props) {
  const { t } = useT();
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);

  // Reset to first step whenever opened.
  useEffect(() => {
    if (open) setIdx(0);
  }, [open]);

  const step = steps[idx];
  const target = step?.target;

  // Scroll target into view when the step changes.
  useEffect(() => {
    if (!open || !target?.current) return;
    try {
      target.current.scrollIntoView({ block: "center", behavior: "smooth" });
    } catch {
      /* ignore */
    }
  }, [open, idx, target]);

  // Measure target rect, kept in sync with scroll/resize.
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => setRect(target?.current ? readRect(target.current) : null);
    const raf = requestAnimationFrame(measure);
    const t1 = window.setTimeout(measure, 250);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t1);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, idx, target]);

  if (!open || !step) return null;

  const pad = 8;
  const isLast = idx === steps.length - 1;

  // Decide card position
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const placement: "top" | "bottom" | "center" =
    step.placement && step.placement !== "auto"
      ? step.placement
      : rect
        ? rect.top + rect.height / 2 < vh / 2
          ? "bottom"
          : "top"
        : "center";

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true">
      {/* dim layer with spotlight cutout */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden>
        <defs>
          <mask id="coach-mask-multi">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {rect && (
              <rect
                x={Math.max(0, rect.left - pad)}
                y={Math.max(0, rect.top - pad)}
                width={rect.width + pad * 2}
                height={rect.height + pad * 2}
                rx={Math.min(24, (rect.height + pad * 2) / 2)}
                ry={Math.min(24, (rect.height + pad * 2) / 2)}
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(0,0,0,0.62)"
          mask="url(#coach-mask-multi)"
        />
      </svg>

      {/* swallow taps on dim layer so users can't accidentally interact with the page */}
      <div className="absolute inset-0" />

      {rect && (
        <div
          className="pointer-events-none absolute ring-2 ring-primary/90 animate-pulse"
          style={{
            top: Math.max(0, rect.top - pad),
            left: Math.max(0, rect.left - pad),
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
            borderRadius: Math.min(24, (rect.height + pad * 2) / 2),
          }}
        />
      )}

      {/* hint card */}
      <div
        className={
          placement === "center"
            ? "absolute inset-0 flex items-center justify-center px-6"
            : placement === "top"
              ? "absolute inset-x-0 top-6 flex justify-center px-6"
              : "absolute inset-x-0 bottom-12 flex justify-center px-6"
        }
      >
        <div
          className="max-w-sm w-full rounded-2xl bg-card text-card-foreground shadow-xl px-5 py-4 relative"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onClose}
            aria-label="close"
            className="absolute top-2 right-2 p-1.5 text-muted-foreground hover:text-foreground"
          >
            <X size={16} />
          </button>
          <div className="text-[11px] warm-muted mb-1">
            {idx + 1} / {steps.length}
          </div>
          <p className="font-display text-base warm-text mb-1">{step.title}</p>
          <p className="text-[13.5px] warm-muted leading-relaxed">{step.body}</p>
          <div className="mt-4 flex justify-end">
            <button
              onClick={() => {
                if (isLast) onClose();
                else setIdx((i) => i + 1);
              }}
              className="inline-flex items-center justify-center rounded-full px-5 py-2 text-[13px] text-primary-foreground active:scale-[0.98] transition-transform"
              style={{ background: "var(--gradient-warm)" }}
            >
              {isLast ? t.coachDone : t.coachNext}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
