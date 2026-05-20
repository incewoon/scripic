import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Heart, ChevronLeft } from "lucide-react";

export const Route = createFileRoute("/easter")({
  component: EasterPage,
  head: () => ({
    meta: [
      { title: "♡ — Scripic" },
      { name: "description", content: "A little secret note." },
    ],
  }),
});

function EasterPage() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShow(true), 80);
    return () => clearTimeout(t);
  }, []);

  const hearts = useMemo(
    () =>
      Array.from({ length: 18 }).map((_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 6,
        duration: 6 + Math.random() * 6,
        size: 12 + Math.random() * 22,
        opacity: 0.35 + Math.random() * 0.5,
      })),
    [],
  );

  return (
    <div
      className="relative min-h-screen overflow-hidden flex items-center justify-center px-6"
      style={{ background: "var(--gradient-warm)" }}
    >
      <Link
        to="/settings"
        aria-label="back"
        className="absolute top-5 left-5 p-2 rounded-full bg-card/40 backdrop-blur-sm text-foreground/70 hover:text-foreground"
      >
        <ChevronLeft size={20} />
      </Link>

      {/* floating hearts */}
      <div className="pointer-events-none absolute inset-0">
        {hearts.map((h) => (
          <Heart
            key={h.id}
            className="absolute text-rose-400/80"
            style={{
              left: `${h.left}%`,
              bottom: `-40px`,
              width: h.size,
              height: h.size,
              opacity: h.opacity,
              fill: "currentColor",
              animation: `floatUp ${h.duration}s ease-in ${h.delay}s infinite`,
            }}
          />
        ))}
      </div>

      <div
        className={`relative text-center transition-all duration-[1200ms] ease-out ${
          show ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-4 scale-95"
        }`}
      >
        <div className="mx-auto mb-6 w-16 h-16 rounded-full bg-card/60 backdrop-blur-md flex items-center justify-center shadow-[var(--shadow-soft)]">
          <Heart size={28} className="text-rose-500" fill="currentColor" />
        </div>
        <h1
          className="font-display text-4xl sm:text-5xl leading-tight warm-text"
          style={{ textShadow: "0 2px 18px rgba(255,180,180,0.45)" }}
        >
          I love you
          <br />
          <span className="italic text-rose-500">all forever</span>
          <span className="inline-block ml-2 animate-pulse text-rose-500">♡</span>
        </h1>
        <p className="mt-5 text-[13px] warm-muted">— a little secret from Scripic</p>
      </div>

      <style>{`
        @keyframes floatUp {
          0% { transform: translateY(0) rotate(0deg); opacity: 0; }
          10% { opacity: 1; }
          100% { transform: translateY(-110vh) rotate(40deg); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
