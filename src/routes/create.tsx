import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { ArrowLeft, ImagePlus, ArrowRight, X, GripVertical, Info } from "lucide-react";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export const Route = createFileRoute("/create")({
  component: Create,
  head: () => ({ meta: [{ title: "새 앨범 만들기 — Memori" }] }),
});

async function fileToDataUrl(file: File, maxDim = 1280): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = URL.createObjectURL(file);
  });
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", 0.82);
}

type Item = { id: string; url: string };

function SortablePhoto({ item, index, onRemove }: { item: Item; index: number; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.85 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative aspect-square rounded-2xl overflow-hidden bg-muted shadow-[var(--shadow-soft)] touch-none"
      {...attributes}
      {...listeners}
    >
      <img src={item.url} alt="" className="w-full h-full object-cover pointer-events-none" />
      <div className="absolute top-1.5 left-1.5 bg-background/85 backdrop-blur rounded-full w-6 h-6 flex items-center justify-center text-[11px] font-semibold text-foreground/80">
        {index + 1}
      </div>
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(); }}
        className="absolute top-1.5 right-1.5 bg-background/90 rounded-full p-1.5 shadow-sm"
        aria-label="사진 삭제"
      ><X size={12} strokeWidth={2.5} /></button>
      <div className="absolute bottom-1.5 right-1.5 bg-background/70 backdrop-blur rounded-md p-0.5 text-foreground/60">
        <GripVertical size={12} />
      </div>
    </div>
  );
}

function Create() {
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setBusy(true);
    try {
      const remaining = 10 - items.length;
      if (files.length > remaining) toast(`최대 10장까지만 추가돼요`);
      const slice = files.slice(0, remaining);
      const urls = await Promise.all(slice.map(f => fileToDataUrl(f)));
      setItems(p => [...p, ...urls.map(u => ({ id: crypto.randomUUID(), url: u }))]);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setItems(prev => {
      const oldIndex = prev.findIndex(i => i.id === active.id);
      const newIndex = prev.findIndex(i => i.id === over.id);
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  const next = () => {
    if (items.length < 5) { toast.error("사진을 5장 이상 골라주세요"); return; }
    sessionStorage.setItem("memori_photos", JSON.stringify(items.map(i => i.url)));
    navigate({ to: "/chat" });
  };

  const count = items.length;
  const pct = Math.min(100, (count / 10) * 100);

  return (
    <div className="mx-auto max-w-md min-h-screen px-5 pt-6 pb-36">
      <header className="flex items-center justify-between mb-6">
        <Link to="/" className="p-2 -ml-2 text-foreground/70"><ArrowLeft size={20}/></Link>
        <span className="text-xs warm-muted">{count} / 10</span>
      </header>

      <h1 className="font-display text-[28px] leading-tight warm-text mb-2">사진을 골라주세요</h1>
      <p className="text-[15px] warm-muted mb-4 leading-relaxed">
        한 사건에 담긴 사진을 모아주세요.
      </p>

      <div
        className="mb-5 rounded-2xl px-4 py-3.5 flex items-start gap-3 border border-primary/25"
        style={{ background: "var(--gradient-warm)" }}
      >
        <Info size={18} className="text-primary mt-0.5 flex-shrink-0" />
        <div className="text-[13.5px] leading-relaxed warm-text">
          <b>최소 5장 · 최대 10장</b>까지 선택할 수 있어요.<br/>
          <span className="warm-muted">길게 눌러 드래그하면 순서를 바꿀 수 있어요 ✨</span>
        </div>
      </div>

      <div className="h-1.5 bg-muted/70 rounded-full overflow-hidden mb-5">
        <div
          className="h-full transition-all duration-500 rounded-full"
          style={{ width: `${pct}%`, background: "var(--gradient-warm)" }}
        />
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={items.map(i => i.id)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-3 gap-2.5 mb-6">
            {items.map((it, i) => (
              <SortablePhoto
                key={it.id}
                item={it}
                index={i}
                onRemove={() => setItems(ps => ps.filter(x => x.id !== it.id))}
              />
            ))}
            {items.length < 10 && (
              <button
                onClick={() => inputRef.current?.click()}
                disabled={busy}
                className="aspect-square rounded-2xl border-2 border-dashed border-primary/40 flex flex-col items-center justify-center text-primary bg-card/50 active:scale-[0.97] transition-transform"
              >
                <ImagePlus size={26} strokeWidth={1.6}/>
                <span className="text-[11px] mt-1.5 warm-muted font-medium">{busy ? "처리중..." : "사진 추가"}</span>
              </button>
            )}
          </div>
        </SortableContext>
      </DndContext>

      <input ref={inputRef} type="file" accept="image/*" multiple onChange={onPick} className="hidden" />

      <div className="fixed bottom-6 left-0 right-0 px-5 mx-auto max-w-md">
        <button
          onClick={next}
          disabled={items.length < 5}
          className="w-full rounded-full py-4 text-[15px] font-medium flex items-center justify-center gap-2 disabled:opacity-50 text-primary-foreground shadow-[var(--shadow-warm)] active:scale-[0.98] transition-transform"
          style={{ background: "var(--gradient-warm)" }}
        >
          {items.length < 5
            ? `${5 - items.length}장 더 골라주세요`
            : <>AI와 이야기하기 <ArrowRight size={18}/></>}
        </button>
      </div>
    </div>
  );
}
