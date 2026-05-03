import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { ArrowLeft, ImagePlus, ArrowRight, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";

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

function Create() {
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setBusy(true);
    try {
      const remaining = 10 - photos.length;
      const slice = files.slice(0, remaining);
      const urls = await Promise.all(slice.map(f => fileToDataUrl(f)));
      setPhotos(p => [...p, ...urls]);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const next = () => {
    if (photos.length < 5) { toast.error("사진을 5장 이상 골라주세요"); return; }
    sessionStorage.setItem("memori_photos", JSON.stringify(photos));
    navigate({ to: "/chat" });
  };

  return (
    <div className="mx-auto max-w-md min-h-screen px-5 pt-6 pb-32">
      <header className="flex items-center justify-between mb-6">
        <Link to="/" className="p-2 -ml-2 text-foreground/70"><ArrowLeft size={20}/></Link>
        <span className="text-xs text-muted-foreground">{photos.length} / 10</span>
      </header>

      <h1 className="font-display text-2xl text-foreground mb-1">사진을 골라주세요</h1>
      <p className="text-sm text-muted-foreground mb-6">한 사건에 대한 사진 <b>5~10장</b>이 좋아요</p>

      <div className="grid grid-cols-3 gap-2 mb-6">
        {photos.map((p, i) => (
          <div key={i} className="relative aspect-square rounded-xl overflow-hidden bg-muted">
            <img src={p} alt="" className="w-full h-full object-cover" />
            <button
              onClick={() => setPhotos(ps => ps.filter((_, idx) => idx !== i))}
              className="absolute top-1 right-1 bg-background/80 rounded-full p-1"
            ><X size={12}/></button>
          </div>
        ))}
        {photos.length < 10 && (
          <button
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="aspect-square rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center text-muted-foreground bg-card/40"
          >
            <ImagePlus size={22}/>
            <span className="text-[10px] mt-1">{busy ? "처리중..." : "추가"}</span>
          </button>
        )}
      </div>

      <input ref={inputRef} type="file" accept="image/*" multiple onChange={onPick} className="hidden" />

      <div className="fixed bottom-6 left-0 right-0 px-5 mx-auto max-w-md">
        <button
          onClick={next}
          disabled={photos.length < 5}
          className="w-full rounded-full py-4 font-medium flex items-center justify-center gap-2 disabled:opacity-50 text-primary-foreground shadow-[var(--shadow-soft)]"
          style={{ background: "var(--primary)" }}
        >
          AI와 이야기하기 <ArrowRight size={18}/>
        </button>
      </div>
    </div>
  );
}
