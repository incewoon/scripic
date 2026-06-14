import { useEffect, useRef, useState } from "react";
import { MapPin, ExternalLink, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useT } from "@/lib/i18n";
import { useServerFn } from "@tanstack/react-start";
import { geocodeLocation } from "@/lib/geocode.functions";

declare global {
  interface Window {
    google?: any;
    __scripicMapsInit?: () => void;
    __scripicMapsLoading?: Promise<void>;
  }
}

function loadGoogleMaps(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.google?.maps) return Promise.resolve();
  if (window.__scripicMapsLoading) return window.__scripicMapsLoading;

  window.__scripicMapsLoading = new Promise<void>((resolve, reject) => {
    const key = (import.meta as any).env?.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY;
    const channel = (import.meta as any).env?.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID;
    if (!key) {
      reject(new Error("Maps key missing"));
      return;
    }
    window.__scripicMapsInit = () => resolve();
    const s = document.createElement("script");
    s.async = true;
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&loading=async&callback=__scripicMapsInit${channel ? `&channel=${encodeURIComponent(channel)}` : ""}`;
    s.onerror = () => reject(new Error("Maps script failed"));
    document.head.appendChild(s);
  });
  return window.__scripicMapsLoading;
}

export function MapDialog({
  open,
  onOpenChange,
  location,
  initialCoords,
  onCoordsResolved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  location: string;
  initialCoords?: { lat: number; lng: number };
  onCoordsResolved?: (c: { lat: number; lng: number }) => void;
}) {
  const { t } = useT();
  const mapRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | undefined>(initialCoords);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "nocoords" | "error">("idle");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const geocode = useServerFn(geocodeLocation);

  // Resolve coords + load map when opened
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setStatus("loading");
    (async () => {
      let c = coords;
      if (!c) {
        try {
          const r = await geocode({ data: { query: location } });
          if (cancelled) return;
          if (r) {
            c = r;
            setCoords(r);
            onCoordsResolved?.(r);
          } else {
            setStatus("nocoords");
            return;
          }
        } catch {
          if (!cancelled) setStatus("nocoords");
          return;
        }
      }
      try {
        await loadGoogleMaps();
        if (cancelled || !mapRef.current || !c) return;
        const map = new window.google.maps.Map(mapRef.current, {
          center: c,
          zoom: 14,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "cooperative",
          clickableIcons: false,
        });
        new window.google.maps.Marker({ position: c, map });
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, location]);

  const openGoogleMaps = () => {
    const q = coords ? `${coords.lat},${coords.lng}` : location;
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md p-0 overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-3">
            <DialogTitle className="flex items-center gap-2 text-base">
              <MapPin size={16} className="text-primary" />
              {location}
            </DialogTitle>
            <DialogDescription className="text-xs">{t.tapMapToOpen}</DialogDescription>
          </DialogHeader>

          <button
            type="button"
            onClick={() => coords && setConfirmOpen(true)}
            className="relative block w-full aspect-square bg-muted focus:outline-none"
            aria-label={t.openGoogleMaps}
          >
            <div ref={mapRef} className="absolute inset-0" />
            {status !== "ready" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted/80 text-sm warm-muted">
                {status === "loading" && <Loader2 size={20} className="animate-spin" />}
                {status === "loading" && <span>{t.loading}</span>}
                {status === "nocoords" && <span className="px-6 text-center">{t.mapUnavailable}</span>}
                {status === "error" && <span className="px-6 text-center">{t.failed}</span>}
              </div>
            )}
            {status === "ready" && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent px-4 py-3 text-left">
                <span className="text-[12px] text-white/95 font-medium">{t.tapMapToOpen}</span>
              </div>
            )}
          </button>

          <div className="px-5 py-3">
            <button
              type="button"
              onClick={() => (coords ? setConfirmOpen(true) : openGoogleMaps())}
              className="w-full flex items-center justify-center gap-2 rounded-full py-2.5 text-[13px] text-primary-foreground active:scale-[0.98] transition-transform"
              style={{ background: "var(--gradient-warm)" }}
            >
              <ExternalLink size={14} /> {t.openGoogleMaps}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.saveToGoogleMapsTitle}</AlertDialogTitle>
            <AlertDialogDescription className="whitespace-pre-line">
              {t.saveToGoogleMapsBody}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmOpen(false);
                openGoogleMaps();
              }}
            >
              {t.openGoogleMaps}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
