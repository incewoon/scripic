import { useEffect, useRef, useState } from "react";
import { MapPin, ExternalLink, Loader2, Check, Search, LocateFixed, X } from "lucide-react";
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
import { geocodeLocation, reverseGeocodeCoords } from "@/lib/geocode.functions";
import { searchPlaces, type PlaceSearchResult } from "@/lib/places.functions";
import { toast } from "sonner";

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
  mode = "view",
  onPick,
  fallbackCenter,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  location: string;
  initialCoords?: { lat: number; lng: number };
  onCoordsResolved?: (c: { lat: number; lng: number }) => void;
  mode?: "view" | "pick";
  /** Called when user confirms a picked location with the resolved short label. */
  onPick?: (p: { lat: number; lng: number; label: string }) => void;
  /** Default center used in pick mode when no initialCoords are available. */
  fallbackCenter?: { lat: number; lng: number };
}) {
  const { t } = useT();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | undefined>(initialCoords);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "nocoords" | "error">("idle");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [picked, setPicked] = useState<{ lat: number; lng: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const markerRef = useRef<any>(null);
  const geocode = useServerFn(geocodeLocation);
  const revGeocode = useServerFn(reverseGeocodeCoords);
  const placeSearch = useServerFn(searchPlaces);

  // Place search (pick mode only)
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);

  // Sync state with the latest props every time the dialog opens.
  // The dialog stays mounted between opens, so without this the `coords`
  // state stays frozen at its first-render value and a second edit pass
  // would open the map without the previously-saved marker — forcing the
  // user to re-click and producing a slightly different coordinate +
  // label than what was originally saved.
  useEffect(() => {
    if (open) {
      setCoords(initialCoords);
      setPicked(mode === "pick" ? (initialCoords ?? null) : null);
      setSaving(false);
      setQuery("");
      setResults(null);
      setSearching(false);
      setLocating(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Resolve coords + load map when opened
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setStatus("loading");
    (async () => {
      // Use the prop, not `coords` state — state updates from setCoords in the
      // open-sync effect haven't flushed yet on this render, so reading state
      // here would re-geocode the label and overwrite the user's picked coords
      // via onCoordsResolved on the very next view-mode open.
      let c: { lat: number; lng: number } | undefined = initialCoords;
      if (mode === "view" && !c) {
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
      // pick mode — never request geolocation; rely on initialCoords/fallback only.
      try {
        await loadGoogleMaps();
        if (cancelled || !mapRef.current) return;
        // Center priority in pick mode: existing coords → fallback (last saved) → Korea center.
        const pickFallback = fallbackCenter ?? { lat: 36.5, lng: 127.8 };
        const center = c ?? (mode === "pick" ? pickFallback : { lat: 20, lng: 0 });
        const map = new window.google.maps.Map(mapRef.current, {
          center,
          zoom: c ? 14 : mode === "pick" ? 11 : 2,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "cooperative",
          clickableIcons: false,
        });
        mapInstanceRef.current = map;
        const marker = new window.google.maps.Marker({
          position: c ?? center,
          map,
          draggable: mode === "pick",
          visible: !!c,
        });
        markerRef.current = marker;

        if (mode === "pick") {
          if (c) {
            marker.setVisible(true);
            setPicked(c);
          }
          map.addListener("click", (e: any) => {
            const lat = e.latLng.lat();
            const lng = e.latLng.lng();
            marker.setPosition({ lat, lng });
            marker.setVisible(true);
            setPicked({ lat, lng });
          });
          marker.addListener("dragend", () => {
            const p = marker.getPosition();
            if (p) setPicked({ lat: p.lat(), lng: p.lng() });
          });
        }
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, location, mode]);

  const openGoogleMaps = () => {
    const q = coords ? `${coords.lat},${coords.lng}` : location;
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  async function confirmPick() {
    if (!picked || saving) return;
    setSaving(true);
    const lang =
      typeof navigator !== "undefined" && navigator.language?.startsWith("ko") ? "ko" : "en";
    let label = `${picked.lat.toFixed(3)}, ${picked.lng.toFixed(3)}`;
    try {
      const r = await revGeocode({ data: { lat: picked.lat, lng: picked.lng, lang } });
      if (r?.label) label = r.label;
    } catch {
      /* keep coord fallback */
    }
    onPick?.({ lat: picked.lat, lng: picked.lng, label });
    setSaving(false);
    onOpenChange(false);
  }

  // Move the map + marker to a coordinate and treat it as the user's pick.
  function moveTo(lat: number, lng: number, zoom = 15) {
    const map = mapInstanceRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;
    const pos = { lat, lng };
    map.panTo(pos);
    map.setZoom(zoom);
    marker.setPosition(pos);
    marker.setVisible(true);
    setPicked(pos);
  }

  // Debounced place search while typing.
  useEffect(() => {
    if (mode !== "pick" || !open) return;
    const q = query.trim();
    if (!q) {
      setResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const id = setTimeout(async () => {
      try {
        const lang =
          typeof navigator !== "undefined" && navigator.language?.startsWith("ko") ? "ko" : "en";
        const r = await placeSearch({ data: { query: q, lang } });
        setResults(r);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(id);
  }, [query, mode, open, placeSearch]);

  function pickResult(r: PlaceSearchResult) {
    moveTo(r.lat, r.lng, 16);
    setResults(null);
    setQuery("");
  }

  function useCurrentLocation() {
    if (locating) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      toast(t.locationPermissionDenied);
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        moveTo(pos.coords.latitude, pos.coords.longitude, 16);
        setLocating(false);
      },
      () => {
        setLocating(false);
        toast(t.locationPermissionDenied);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
    );
  }

  const isPick = mode === "pick";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md p-0 overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-3">
            <DialogTitle className="flex items-center gap-2 text-base">
              <MapPin size={16} className="text-primary" />
              {isPick ? t.pickLocationTitle : location}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {isPick ? t.pickLocationHint : t.tapMapToOpen}
            </DialogDescription>
          </DialogHeader>

          {isPick ? (
            <div className="relative block w-full aspect-square bg-muted">
              <div ref={mapRef} className="absolute inset-0" />
              {status !== "ready" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted/80 text-sm warm-muted">
                  {status === "loading" && <Loader2 size={20} className="animate-spin" />}
                  {status === "loading" && <span>{t.loading}</span>}
                  {status === "error" && <span className="px-6 text-center">{t.failed}</span>}
                </div>
              )}
            </div>
          ) : (
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
          )}

          <div className="px-5 py-3">
            {isPick ? (
              <button
                type="button"
                onClick={confirmPick}
                disabled={!picked || saving}
                className="w-full flex items-center justify-center gap-2 rounded-full py-2.5 text-[13px] text-primary-foreground active:scale-[0.98] transition-transform disabled:opacity-50"
                style={{ background: "var(--gradient-warm)" }}
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                {t.saveLocation}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => (coords ? setConfirmOpen(true) : openGoogleMaps())}
                className="w-full flex items-center justify-center gap-2 rounded-full py-2.5 text-[13px] text-primary-foreground active:scale-[0.98] transition-transform"
                style={{ background: "var(--gradient-warm)" }}
              >
                <ExternalLink size={14} /> {t.openGoogleMaps}
              </button>
            )}
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
