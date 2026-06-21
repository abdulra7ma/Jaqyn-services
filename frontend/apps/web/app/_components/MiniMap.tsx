"use client";

import { useT } from "@jaqyn/i18n";
import { cn } from "@jaqyn/ui";
import { useEffect, useMemo, useRef, useState } from "react";

export type MapPin = {
  id: string;
  initial: string;
  name: string;
  dist?: string;
  closest?: boolean;
  lat?: number | null;
  lng?: number | null;
  accent?: string;
};

type Point = MapPin & { x: number; y: number };
type UserLocation = { lat: number; lng: number } | null;
type GoogleMap = any;
type GoogleMarker = any;

const GOOGLE_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
const BISHKEK = { lat: 42.8746, lng: 74.5698 };
let googleMapsPromise: Promise<any> | null = null;

const FALLBACK_SPOTS = [
  { x: 62, y: 22 },
  { x: 22, y: 44 },
  { x: 82, y: 46 },
  { x: 44, y: 72 },
  { x: 68, y: 76 },
  { x: 30, y: 24 },
];
const USER_FALLBACK_SPOTS = [
  { x: 62, y: 38 },
  { x: 34, y: 45 },
  { x: 57, y: 66 },
  { x: 42, y: 26 },
  { x: 72, y: 58 },
  { x: 26, y: 62 },
];

export function MiniMap({
  pins,
  selectedId,
  onSelect,
  userLocation,
  onUseLocation,
}: {
  pins: MapPin[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  userLocation?: UserLocation;
  onUseLocation?: () => void;
}) {
  const t = useT();
  const [zoom, setZoom] = useState(1);
  const [full, setFull] = useState(false);
  const [googleFailed, setGoogleFailed] = useState(false);
  const points = useMemo(() => placePins(pins, userLocation), [pins, userLocation]);
  const userPoint = useMemo(() => placeUser(points, userLocation), [points, userLocation]);
  const selected = points.find((p) => p.id === selectedId) ?? points[0] ?? null;
  const useGoogle = !!GOOGLE_MAPS_KEY && !googleFailed;

  function changeZoom(delta: number) {
    setZoom((z) => Math.min(2.2, Math.max(0.85, Number((z + delta).toFixed(2)))));
  }

  const fallbackBody = (
    <div className="relative h-full overflow-hidden rounded-[22px] border border-line bg-[#EEE6D6]">
      <div
        className="absolute inset-0 origin-center transition-transform duration-200"
        style={{
          transform: `scale(${zoom})`,
          background:
            "repeating-linear-gradient(0deg,transparent,transparent 39px,rgba(120,90,50,.05) 39px,rgba(120,90,50,.05) 40px),repeating-linear-gradient(90deg,transparent,transparent 39px,rgba(120,90,50,.05) 39px,rgba(120,90,50,.05) 40px),#EEE6D6",
        }}
      >
        <div className="absolute left-0 right-0 top-[46%] h-[15px] bg-[#F8F2E7]" />
        <div className="absolute bottom-0 top-0 left-[43%] w-[15px] bg-[#F8F2E7]" />
        <div className="absolute left-[12%] top-[20%] h-[10px] w-[82%] -rotate-12 rounded-pill bg-[#F8F2E7]" />
        <div className="absolute bottom-0 left-0 h-[30%] w-[42%] bg-[rgba(110,150,120,.16)]" />

        {userPoint && (
          <div className="absolute z-[7]" style={{ left: `${userPoint.x}%`, top: `${userPoint.y}%` }}>
            <span className="absolute left-1/2 top-1/2 h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[rgba(94,139,106,.24)]" />
            <span className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-sage shadow" />
          </div>
        )}

        {points.map((p) => {
          const active = p.id === selectedId || (!selectedId && p.closest);
          return (
            <button
              key={p.id}
              onClick={() => onSelect?.(p.id)}
              className="absolute z-[8] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center outline-none"
              style={{ left: `${p.x}%`, top: `${p.y}%` }}
            >
              {(active || p.closest) && (
                <span className="mb-1.5 max-w-[170px] truncate whitespace-nowrap rounded-[9px] border border-line bg-card px-2.5 py-1 text-[10.5px] font-bold shadow-card">
                  {p.name}
                  {p.dist ? ` · ${p.dist}` : ""}
                </span>
              )}
              <span
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full border-2 border-white font-display text-sm font-extrabold shadow-card transition",
                  active ? "scale-110 text-brand-fg" : "bg-card text-brand",
                )}
                style={active ? { background: p.accent || "#C25E3C" } : undefined}
              >
                {p.initial}
              </span>
            </button>
          );
        })}
      </div>

      <div className="absolute left-3 top-3 z-20 flex gap-1.5">
        <MapButton label="+" onClick={() => changeZoom(0.2)} />
        <MapButton label="-" onClick={() => changeZoom(-0.2)} />
        <MapButton label="Fit" onClick={() => setZoom(1)} />
      </div>
      <div className="absolute right-3 top-3 z-20 flex gap-1.5">
        {onUseLocation && <MapButton label={t("nearby.you")} onClick={onUseLocation} />}
        <MapButton label={full ? "Close" : "Full"} onClick={() => setFull((v) => !v)} />
      </div>

      {selected && (
        <div className="absolute bottom-3 left-3 right-3 z-20 flex items-center gap-3 rounded-[14px] border border-line bg-card/95 p-3 shadow-card backdrop-blur">
          <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-brand-muted font-display font-bold text-brand">
            {selected.initial}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold text-ink">{selected.name}</div>
            <div className="text-xs font-semibold text-subtle">{selected.dist || t("nearby.title")}</div>
          </div>
        </div>
      )}

      {full && points.length > 0 && (
        <div className="absolute bottom-20 left-3 right-3 z-20 flex gap-2 overflow-x-auto pb-1 lg:left-auto lg:top-16 lg:w-64 lg:flex-col lg:overflow-y-auto">
          {points.map((p) => (
            <button
              key={p.id}
              onClick={() => onSelect?.(p.id)}
              className={cn(
                "min-w-[180px] rounded-[13px] border px-3 py-2 text-left shadow-card lg:min-w-0",
                p.id === selectedId ? "border-brand bg-brand-muted" : "border-line bg-card",
              )}
            >
              <div className="truncate text-sm font-bold text-ink">{p.name}</div>
              <div className="text-xs text-subtle">{p.dist || p.initial}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
  const body = useGoogle ? (
    <GoogleMapBody
      pins={pins}
      selectedId={selectedId}
      onSelect={onSelect}
      userLocation={userLocation}
      onUseLocation={onUseLocation}
      full={full}
      setFull={setFull}
      onError={() => setGoogleFailed(true)}
    />
  ) : (
    fallbackBody
  );

  if (full) {
    return (
      <div className="fixed inset-0 z-50 bg-cream p-3 lg:p-6">
        <div className="h-full">{body}</div>
      </div>
    );
  }

  return <div className="relative mt-1 h-[260px]">{body}</div>;
}

function GoogleMapBody({
  pins,
  selectedId,
  onSelect,
  userLocation,
  onUseLocation,
  full,
  setFull,
  onError,
}: {
  pins: MapPin[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  userLocation?: UserLocation;
  onUseLocation?: () => void;
  full: boolean;
  setFull: (next: boolean | ((current: boolean) => boolean)) => void;
  onError: () => void;
}) {
  const t = useT();
  const mapEl = useRef<HTMLDivElement>(null);
  const map = useRef<GoogleMap | null>(null);
  const markers = useRef<GoogleMarker[]>([]);
  const userMarker = useRef<GoogleMarker | null>(null);
  const selected = pins.find((p) => p.id === selectedId) ?? pins[0] ?? null;

  useEffect(() => {
    let cancelled = false;
    const previousAuthFailure = (window as any).gm_authFailure;
    (window as any).gm_authFailure = () => {
      onError();
      if (typeof previousAuthFailure === "function") previousAuthFailure();
    };
    loadGoogleMaps()
      .then((google) => {
        if (cancelled || !mapEl.current || map.current) return;
        if (!google?.maps?.Map) throw new Error("Google Maps did not initialize");
        map.current = new google.maps.Map(mapEl.current, {
          center: userLocation ?? pinCenter(pins) ?? BISHKEK,
          zoom: pins.length > 1 ? 13 : 15,
          disableDefaultUI: true,
          zoomControl: true,
          clickableIcons: false,
          gestureHandling: "greedy",
          styles: WARM_MAP_STYLE,
        });
      })
      .catch(onError);
    return () => {
      cancelled = true;
      (window as any).gm_authFailure = previousAuthFailure;
    };
  }, [onError, pins, userLocation]);

  useEffect(() => {
    const currentMap = map.current;
    const google = (window as any).google;
    if (!currentMap || !google?.maps) return;

    markers.current.forEach((m) => m.setMap(null));
    markers.current = [];

    pins.forEach((pin) => {
      if (typeof pin.lat !== "number" || typeof pin.lng !== "number") return;
      const active = pin.id === selectedId || (!selectedId && pin.closest);
      const marker = new google.maps.Marker({
        map: currentMap,
        position: { lat: pin.lat, lng: pin.lng },
        title: pin.name,
        label: {
          text: pin.initial.slice(0, 2),
          color: active ? "#ffffff" : "#C25E3C",
          fontFamily: "Bricolage Grotesque, sans-serif",
          fontWeight: "800",
        },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: active ? 16 : 13,
          fillColor: active ? pin.accent || "#C25E3C" : "#ffffff",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 3,
        },
        zIndex: active ? 20 : 10,
      });
      marker.addListener("click", () => onSelect?.(pin.id));
      markers.current.push(marker);
    });

    if (userMarker.current) userMarker.current.setMap(null);
    userMarker.current = null;
    if (userLocation) {
      userMarker.current = new google.maps.Marker({
        map: currentMap,
        position: userLocation,
        title: t("nearby.you"),
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 9,
          fillColor: "#3F7355",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 4,
        },
        zIndex: 30,
      });
    }

    fitGoogleMap(currentMap, pins, userLocation);
  }, [pins, selectedId, onSelect, userLocation, t]);

  function zoomBy(delta: number) {
    if (!map.current) return;
    map.current.setZoom(Math.max(3, Math.min(20, (map.current.getZoom() ?? 13) + delta)));
  }

  function fit() {
    if (map.current) fitGoogleMap(map.current, pins, userLocation);
  }

  return (
    <div className="relative h-full overflow-hidden rounded-[22px] border border-line bg-[#EEE6D6]">
      <div ref={mapEl} className="absolute inset-0" />

      <div className="absolute left-3 top-3 z-20 flex gap-1.5">
        <MapButton label="+" onClick={() => zoomBy(1)} />
        <MapButton label="-" onClick={() => zoomBy(-1)} />
        <MapButton label="Fit" onClick={fit} />
      </div>
      <div className="absolute right-3 top-3 z-20 flex gap-1.5">
        {onUseLocation && <MapButton label={t("nearby.you")} onClick={() => onUseLocation()} />}
        <MapButton label={full ? "Close" : "Full"} onClick={() => setFull((v) => !v)} />
      </div>

      {selected && (
        <div className="absolute bottom-3 left-3 right-3 z-20 flex items-center gap-3 rounded-[14px] border border-line bg-card/95 p-3 shadow-card backdrop-blur">
          <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-brand-muted font-display font-bold text-brand">
            {selected.initial}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold text-ink">{selected.name}</div>
            <div className="text-xs font-semibold text-subtle">{selected.dist || t("nearby.title")}</div>
          </div>
        </div>
      )}

      {full && pins.length > 0 && (
        <div className="absolute bottom-20 left-3 right-3 z-20 flex gap-2 overflow-x-auto pb-1 lg:left-auto lg:top-16 lg:w-64 lg:flex-col lg:overflow-y-auto">
          {pins.map((p) => (
            <button
              key={p.id}
              onClick={() => onSelect?.(p.id)}
              className={cn(
                "min-w-[180px] rounded-[13px] border px-3 py-2 text-left shadow-card lg:min-w-0",
                p.id === selectedId ? "border-brand bg-brand-muted" : "border-line bg-card",
              )}
            >
              <div className="truncate text-sm font-bold text-ink">{p.name}</div>
              <div className="text-xs text-subtle">{p.dist || p.initial}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MapButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-[10px] border border-line bg-card px-3 py-2 text-xs font-bold text-ink shadow-card transition active:scale-[.98]"
    >
      {label}
    </button>
  );
}

function placePins(pins: MapPin[], userLocation?: UserLocation): Point[] {
  if (userLocation) return placePinsAroundUser(pins, userLocation);

  const withGeo = pins.filter((p) => typeof p.lat === "number" && typeof p.lng === "number");
  if (withGeo.length < 2) {
    return pins.map((p, i) => ({ ...p, ...(FALLBACK_SPOTS[i % FALLBACK_SPOTS.length] ?? FALLBACK_SPOTS[0]!) }));
  }

  const lats = withGeo.map((p) => p.lat as number);
  const lngs = withGeo.map((p) => p.lng as number);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latSpan = Math.max(0.01, maxLat - minLat);
  const lngSpan = Math.max(0.01, maxLng - minLng);

  return pins.map((p, i) => {
    if (typeof p.lat !== "number" || typeof p.lng !== "number") {
      return { ...p, ...(FALLBACK_SPOTS[i % FALLBACK_SPOTS.length] ?? FALLBACK_SPOTS[0]!) };
    }
    return {
      ...p,
      x: 12 + ((p.lng - minLng) / lngSpan) * 76,
      y: 12 + ((maxLat - p.lat) / latSpan) * 76,
    };
  });
}

function placeUser(points: Point[], userLocation?: UserLocation): { x: number; y: number } | null {
  return userLocation ? { x: 50, y: 50 } : null;
}

function placePinsAroundUser(pins: MapPin[], userLocation: Exclude<UserLocation, null>): Point[] {
  const geo = pins.filter((p) => typeof p.lat === "number" && typeof p.lng === "number");
  if (geo.length === 0) {
    return pins.map((p, i) => ({ ...p, ...(USER_FALLBACK_SPOTS[i % USER_FALLBACK_SPOTS.length] ?? USER_FALLBACK_SPOTS[0]!) }));
  }

  const maxDelta = Math.max(
    0.004,
    ...geo.map((p) =>
      Math.max(Math.abs((p.lat as number) - userLocation.lat), Math.abs(((p.lng as number) - userLocation.lng) * 0.75)),
    ),
  );
  const scale = 32 / maxDelta;

  return pins.map((p, i) => {
    if (typeof p.lat !== "number" || typeof p.lng !== "number") {
      return { ...p, ...(USER_FALLBACK_SPOTS[i % USER_FALLBACK_SPOTS.length] ?? USER_FALLBACK_SPOTS[0]!) };
    }
    const x = clamp(50 + (p.lng - userLocation.lng) * 0.75 * scale, 14, 86);
    const y = clamp(50 - (p.lat - userLocation.lat) * scale, 14, 86);
    return { ...p, x, y };
  });
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function loadGoogleMaps(): Promise<any> {
  const existing = (window as any).google?.maps;
  if (existing) return Promise.resolve((window as any).google);
  if (googleMapsPromise) return googleMapsPromise;
  googleMapsPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_KEY}&v=weekly`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve((window as any).google);
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return googleMapsPromise;
}

function pinCenter(pins: MapPin[]): { lat: number; lng: number } | null {
  const geo = pins.filter((p) => typeof p.lat === "number" && typeof p.lng === "number");
  if (geo.length === 0) return null;
  return {
    lat: geo.reduce((sum, p) => sum + (p.lat as number), 0) / geo.length,
    lng: geo.reduce((sum, p) => sum + (p.lng as number), 0) / geo.length,
  };
}

function fitGoogleMap(map: GoogleMap, pins: MapPin[], userLocation?: UserLocation) {
  const google = (window as any).google;
  if (!google?.maps) return;
  const bounds = new google.maps.LatLngBounds();
  let count = 0;
  if (userLocation) {
    bounds.extend(userLocation);
    count += 1;
  }
  pins.forEach((p) => {
    if (typeof p.lat === "number" && typeof p.lng === "number") {
      bounds.extend({ lat: p.lat, lng: p.lng });
      count += 1;
    }
  });
  if (count === 0) {
    map.setCenter(BISHKEK);
    map.setZoom(13);
  } else if (count === 1) {
    map.setCenter(userLocation ?? pinCenter(pins) ?? BISHKEK);
    map.setZoom(15);
  } else {
    map.fitBounds(bounds, 56);
  }
}

const WARM_MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#efe6d6" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#6f6254" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#fbf6ee" }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#d6c6ae" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#e7dcc9" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#dce7d7" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#fff8ee" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#e2d4bf" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#cbd9d6" }] },
];
