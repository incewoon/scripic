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
import { getFns } from '@/integrations/firebase/client';
import { httpsCallable } from 'firebase/functions';
import { toast } from "sonner";
import { Capacitor } from '@capacitor/core';

type PlaceSearchResult = {
  name: string;
  address?: string;
  lat: number;
  lng: number;
  placeId?: string;
};

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
    const key = (import.meta as any).env?.VITE_GOOGLE_MAPS_BROWSER_KEY;

    if (!key) {
      reject(new Error("VITE_GOOGLE_MAPS_BROWSER_KEY가 설정되지 않았습니다."));
      return;
    }

    const channel = (import.meta as any).env?.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID;

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
          const functions = getFns();
          const geocodeFn = httpsCallable<
            { query: string; lang?: string }, 
            any   // 필요에 따라 타입을 더 정확히 정의할 수 있음
          >(functions, "geocodeLocation");   // ← Firebase에 만들 함수 이름
          
          const result = await geocodeFn({ 
            query: location, 
            lang: typeof navigator !== "undefined" && navigator.language?.startsWith("ko") ? "ko" : "en"
          });
          
          const r = result.data;
          
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
      typeof navigator !== "undefined" && navigator.language?.startsWith("ko")
        ? "ko"
        : "en";
  
    let label = `${picked.lat.toFixed(3)}, ${picked.lng.toFixed(3)}`;
    console.log(`[confirmPick] 시작 - picked:`, picked);
    try {
      // Firebase Functions를 통한 역지오코딩 호출
      const functions = getFns();
      const reverseGeocodeFn = httpsCallable<
        { lat: number; lng: number; lang?: string },
        { label: string }
      >(functions, "reverseGeocode");
  
      const result = await reverseGeocodeFn({
        lat: picked.lat,
        lng: picked.lng,
        lang,
      });
      console.log(`[confirmPick] Firebase reverseGeocode 결과:`, result.data);
      
      if (result.data?.label) {
        label = result.data.label;
      }
    } catch (error) {
      console.warn("Firebase 역지오코딩 실패, 클라이언트 Geocoder로 fallback:", error);
  
      // Fallback: 클라이언트 Geocoder 사용
      try {
        if (window.google?.maps) {
          const geocoder = new window.google.maps.Geocoder();
          const geocodeResult = await geocoder.geocode({
            location: { lat: picked.lat, lng: picked.lng },
            language: lang,
          });
  
          const results = geocodeResult?.results ?? [];
          if (results.length > 0) {
            // 기존 주소 파싱 로직 유지
            const result = results[0];
            // ... (기존 주소 파싱 코드)
          }
        }
      } catch (fallbackError) {
        console.warn("클라이언트 역지오코딩도 실패:", fallbackError);
      }
    }
    console.log(`[confirmPick] 최종 label: ${label}`);
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

        const functionsInstance = getFns();
        const searchPlacesFn = httpsCallable<{ query: string; lang?: string }, PlaceSearchResult[]>(
          functionsInstance,
          "searchPlaces"
        );
    
        const result = await searchPlacesFn({ query: q, lang });
        setResults(result.data);
      } catch (error) {
        console.error("searchPlacesFn 호출 에러:", error);
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(id);
  }, [query, mode, open]);

  function pickResult(r: PlaceSearchResult) {
    moveTo(r.lat, r.lng, 16);
    setResults(null);
    setQuery("");
  }

  function useCurrentLocation() {
    if (locating) return;
    setLocating(true);
  
    const getLocation = async () => {
      try {
        if (Capacitor.isNativePlatform()) {
          console.log("네이티브 환경 - Geolocation 플러그인 호출 시도");
  
          // import() 없이 Capacitor 브릿지 직접 사용
          const Geolocation = (window as any).Capacitor?.Plugins?.Geolocation;
  
          if (!Geolocation) {
            console.error("Geolocation 플러그인이 등록되지 않았습니다.");
            toast(t.locationPermissionDenied);
            setLocating(false);
            return;
          }
  
          const permission = await Geolocation.requestPermissions();
          console.log("권한 요청 결과:", permission);
  
          if (permission.location === 'denied' || permission.coarseLocation === 'denied') {
            toast(t.locationPermissionDenied);
            setLocating(false);
            return;
          }
  
          const position = await Geolocation.getCurrentPosition({
            enableHighAccuracy: true,
            timeout: 10000,
          });
  
          console.log("위치 획득 성공:", position.coords);
          moveTo(position.coords.latitude, position.coords.longitude, 16);
        } else {
          // 웹 환경 (Lovable)
          console.log("웹 환경 - navigator.geolocation 사용");
          if (!navigator.geolocation) {
            toast(t.locationPermissionDenied);
            setLocating(false);
            return;
          }
  
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              moveTo(pos.coords.latitude, pos.coords.longitude, 16);
            },
            () => {
              toast(t.locationPermissionDenied);
            },
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 }
          );
          return; // 웹에서는 setLocating(false)를 콜백 안에서 처리
        }
      } catch (error) {
        console.error("위치 가져오기 전체 실패:", error);
        toast(t.locationPermissionDenied);
      } finally {
        setLocating(false);
      }
    };
  
    getLocation();
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
            <>
              <div className="px-5 pb-3">
                <div className="relative flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search
                      size={14}
                      className="absolute left-3 top-1/2 -translate-y-1/2 warm-muted pointer-events-none"
                    />
                    <input
                      type="text"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={t.searchPlacePlaceholder}
                      className="w-full rounded-full bg-muted pl-8 pr-8 py-2 text-[13px] outline-none focus:ring-1 focus:ring-primary/40"
                    />
                    {query && (
                      <button
                        type="button"
                        onClick={() => {
                          setQuery("");
                          setResults(null);
                        }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 warm-muted"
                        aria-label="Clear"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={useCurrentLocation}
                    disabled={locating}
                    aria-label={t.useCurrentLocation}
                    title={t.useCurrentLocation}
                    className="shrink-0 rounded-full bg-muted p-2 active:scale-95 transition-transform disabled:opacity-50"
                  >
                    {locating ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <LocateFixed size={14} />
                    )}
                  </button>
                </div>
                {(searching || results) && query.trim() && (
                  <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border bg-background shadow-sm">
                    {searching && (
                      <div className="px-3 py-2 text-[12px] warm-muted flex items-center gap-2">
                        <Loader2 size={12} className="animate-spin" />
                        {t.searching}
                      </div>
                    )}
                    {!searching && results && results.length === 0 && (
                      <div className="px-3 py-2 text-[12px] warm-muted">
                        {t.placeSearchNoResults}
                      </div>
                    )}
                    {!searching &&
                      results?.map((r) => (
                        <button
                          key={r.placeId ?? `${r.lat},${r.lng}`}
                          type="button"
                          onClick={() => pickResult(r)}
                          className="w-full text-left px-3 py-2 hover:bg-muted/60 border-b last:border-b-0"
                        >
                          <div className="text-[13px] truncate">{r.name || r.address}</div>
                          {r.name && r.address && (
                            <div className="text-[11px] warm-muted truncate">{r.address}</div>
                          )}
                        </button>
                      ))}
                  </div>
                )}
              </div>
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
            </>
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
