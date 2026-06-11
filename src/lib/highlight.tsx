import { Fragment } from "react";

export function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function tokenize(query: string): string[] {
  const q = (query || "").trim().toLowerCase();
  if (!q) return [];
  return q.split(/\s+/).filter(Boolean);
}

export function Hl({ text, query }: { text: string; query: string }) {
  if (!text) return null;
  const tokens = tokenize(query);
  if (!tokens.length) return <>{text}</>;
  const pattern = new RegExp(`(${tokens.map(escapeRegExp).join("|")})`, "gi");
  const parts = text.split(pattern);
  const lower = tokens.map((t) => t.toLowerCase());
  return (
    <>
      {parts.map((p, i) =>
        p && lower.includes(p.toLowerCase()) ? (
          <mark key={i} className="bg-primary/40 text-inherit rounded-sm px-0.5">
            {p}
          </mark>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        )
      )}
    </>
  );
}
