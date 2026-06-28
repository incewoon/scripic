import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useT } from "@/lib/i18n";
import { getAlbums } from "@/lib/storage";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  value: string[];
  onChange: (next: string[]) => void;
};

const MAX_TAGS = 5;

export function TagPickerDialog({ open, onOpenChange, value, onChange }: Props) {
  const { t } = useT();
  const [myTags, setMyTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");

  const presets: string[] = [
    t.tagPresetTravel,
    t.tagPresetFamily,
    t.tagPresetDaily,
    t.tagPresetFriends,
    t.tagPresetFood,
    t.tagPresetSpecial,
  ];

  useEffect(() => {
    if (!open) return;
    const presetSet = new Set(presets);
    void getAlbums()
      .then((albums) => {
        const seen = new Set<string>();
        const out: string[] = [];
        for (const a of [...albums].reverse()) {
          for (const tg of a.tags ?? []) {
            if (!tg || presetSet.has(tg)) continue;
            const k = tg.toLowerCase();
            if (seen.has(k)) continue;
            seen.add(k);
            out.push(tg);
          }
        }
        setMyTags(out);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const toggle = (tag: string) => {
    if (value.includes(tag)) {
      onChange(value.filter((x) => x !== tag));
    } else {
      if (value.length >= MAX_TAGS) return;
      onChange([...value, tag]);
    }
  };

  const addDraft = () => {
    const v = tagDraft.trim().replace(/^#/, "").slice(0, 20);
    if (!v) return;
    if (value.some((x) => x.toLowerCase() === v.toLowerCase())) {
      setTagDraft("");
      return;
    }
    if (value.length >= MAX_TAGS) return;
    onChange([...value, v]);
    setTagDraft("");
  };

  const customTags = value.filter((tg) => !presets.includes(tg) && !myTags.includes(tg));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">{t.tagsLabel}</DialogTitle>
        </DialogHeader>

        <div className="text-[12px] warm-muted -mt-1">{t.tagsHint}</div>

        <div className="flex flex-wrap gap-1.5">
          {presets.map((p) => {
            const active = value.includes(p);
            return (
              <button
                key={p}
                type="button"
                onClick={() => toggle(p)}
                className={`px-3 py-1.5 rounded-full text-[12px] font-medium transition-all active:scale-[0.97] ${
                  active
                    ? "text-primary-foreground shadow-[var(--shadow-warm)]"
                    : "border border-border/60 warm-text bg-card/50"
                }`}
                style={active ? { background: "var(--gradient-warm)" } : undefined}
              >
                #{p}
              </button>
            );
          })}
        </div>

        {myTags.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
            {myTags.map((p) => {
              const active = value.includes(p);
              return (
                <button
                  key={`my-${p}`}
                  type="button"
                  onClick={() => toggle(p)}
                  className={`px-3 py-1.5 rounded-full whitespace-nowrap flex-shrink-0 text-[12px] font-medium transition-all active:scale-[0.97] ${
                    active
                      ? "text-primary-foreground shadow-[var(--shadow-warm)]"
                      : "border border-border/60 warm-text bg-card/50"
                  }`}
                  style={active ? { background: "var(--gradient-warm)" } : undefined}
                >
                  #{p}
                </button>
              );
            })}
          </div>
        )}

        {customTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {customTags.map((tg) => (
              <span
                key={tg}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[12px] font-medium text-primary-foreground shadow-[var(--shadow-warm)]"
                style={{ background: "var(--gradient-warm)" }}
              >
                #{tg}
                <button
                  type="button"
                  onClick={() => onChange(value.filter((x) => x !== tg))}
                  aria-label="remove"
                  className="opacity-90"
                >
                  <X size={11} strokeWidth={2.5} />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="flex gap-1.5 pt-1">
          <input
            type="text"
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addDraft();
              }
            }}
            placeholder={t.tagAddPlaceholder}
            maxLength={20}
            className="flex-1 h-9 rounded-full border border-border/60 bg-card/80 px-3.5 text-[12.5px] warm-text placeholder:warm-muted focus:outline-none focus:bg-card"
          />
          <button
            type="button"
            onClick={addDraft}
            className="h-9 px-3.5 rounded-full text-[12.5px] font-medium border border-border/60 warm-text bg-card/50 active:scale-[0.97]"
          >
            {t.tagAdd}
          </button>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="px-4 py-2 rounded-full text-[13px] font-medium text-primary-foreground shadow-[var(--shadow-warm)]"
            style={{ background: "var(--gradient-warm)" }}
          >
            {t.close}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
