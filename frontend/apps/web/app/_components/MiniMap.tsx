"use client";

import { MarkerClusterer } from "@googlemaps/markerclusterer";
import { useT } from "@jaqyn/i18n";
import { Badge, cn } from "@jaqyn/ui";
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
  // Business logo (relative /media/... url) rendered inside the pin and cards when
  // present; falls back to the initial when null or the image fails to load.
  logoUrl?: string | null;
  // Optional details surfaced in the hover tooltip + the selected-business card.
  category?: string;
  reward?: string;
  // Open/closed right now (null = hours unknown), shown as a status badge.
  open?: boolean | null;
};

// Brand orange for the live "you are here" dot.
const USER_DOT_COLOR = "#F2741B";

/**
 * Round logo image for a map pin / business card. Falls back to the initial in a
 * branded circle when no logo is set or the image fails to load. Plain <img> (not
 * next/image) so the same-origin /media/ proxy rewrite works.
 */
function PinLogo({
  logoUrl,
  initial,
  size,
  accent,
  active,
}: {
  logoUrl?: string | null;
  initial: string;
  size: number;
  accent?: string;
  active?: boolean;
}) {
  const [err, setErr] = useState(false);
  if (logoUrl && !err) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt=""
        width={size}
        height={size}
        aria-hidden
        onError={() => setErr(true)}
        className="flex-none rounded-full border-2 border-white object-cover shadow-card"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className={cn(
        "flex flex-none items-center justify-center rounded-full border-2 border-white font-display font-extrabold shadow-card",
        active ? "text-brand-fg" : "bg-card text-brand",
      )}
      style={{ width: size, height: size, fontSize: size * 0.4, background: active ? accent || "#C25E3C" : undefined }}
    >
      {initial}
    </span>
  );
}

type Point = MapPin & { x: number; y: number };
type UserLocation = { lat: number; lng: number } | null;
// 2GIS MapGL exposes a single global `mapgl`; its Map/Marker have no public TS types.
type DgisMap = any;
type DgisMarker = any;
type GoogleMap = any;
type GoogleMarker = any;

// 2GIS MapGL API key. Public by design (ships in the client bundle, domain-restricted
// in the 2GIS account). Env-driven so prod/staging can rotate without a code change.
const DGIS_KEY = process.env.NEXT_PUBLIC_DGIS_MAPGL_KEY;
// Google Maps JS API key (the alternative provider).
const GOOGLE_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
// Which map provider to render: "google" or "2gis" (default). Set via env so we can flip
// providers per-environment without a code change; falls back to the SVG map if the
// chosen provider has no key or fails to load.
const MAP_PROVIDER = (process.env.NEXT_PUBLIC_MAP_PROVIDER ?? "2gis").toLowerCase();
const BISHKEK = { lat: 42.8746, lng: 74.5698 };
let mapglPromise: Promise<any> | null = null;
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
  onOpen,
  userLocation,
  onUseLocation,
  onMapClick,
  bare = false,
}: {
  pins: MapPin[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** Fired when a business is clicked to be opened (navigates to its profile). */
  onOpen?: (id: string) => void;
  userLocation?: UserLocation;
  onUseLocation?: () => void;
  /** Fired when the map background (not a pin) is tapped. */
  onMapClick?: () => void;
  /**
   * Full-bleed mode: fill the parent edge-to-edge with no border/corners and
   * suppress the in-map chrome (zoom / full toggle / selected-card / list) so
   * only the map + pins show. The host screen supplies its own controls. Used
   * by the customer Nearby map; the embedded list/picker maps leave it `false`.
   */
  bare?: boolean;
}) {
  const t = useT();
  const [zoom, setZoom] = useState(1);
  const [full, setFull] = useState(false);
  const [dgisFailed, setDgisFailed] = useState(false);
  const [googleFailed, setGoogleFailed] = useState(false);
  const points = useMemo(() => placePins(pins, userLocation), [pins, userLocation]);
  const userPoint = useMemo(() => placeUser(points, userLocation), [points, userLocation]);
  const selected = points.find((p) => p.id === selectedId) ?? points[0] ?? null;
  // Provider selection: honour NEXT_PUBLIC_MAP_PROVIDER, but only if that provider has a
  // key and hasn't errored at runtime. Otherwise fall through to the SVG fallback.
  const useGoogle = MAP_PROVIDER === "google" && !!GOOGLE_MAPS_KEY && !googleFailed;
  const useDgis = MAP_PROVIDER !== "google" && !!DGIS_KEY && !dgisFailed;

  function changeZoom(delta: number) {
    setZoom((z) => Math.min(2.2, Math.max(0.85, Number((z + delta).toFixed(2)))));
  }

  const fallbackBody = (
    <div className={cn("relative h-full overflow-hidden bg-[#EEE6D6]", !bare && "rounded-[22px] border border-line")}>
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
              onClick={() => (onOpen ? onOpen(p.id) : onSelect?.(p.id))}
              className="absolute z-[8] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center outline-none"
              style={{ left: `${p.x}%`, top: `${p.y}%` }}
            >
              {(active || p.closest) && (
                <span className="mb-1.5 max-w-[170px] truncate whitespace-nowrap rounded-[9px] border border-line bg-card px-2.5 py-1 text-[10.5px] font-bold shadow-card">
                  {p.name}
                  {p.dist ? ` · ${p.dist}` : ""}
                </span>
              )}
              <span className={cn("transition", active && "scale-110")}>
                <PinLogo
                  logoUrl={p.logoUrl}
                  initial={p.initial}
                  size={36}
                  accent={p.accent}
                  active={active}
                />
              </span>
            </button>
          );
        })}
      </div>

      <MapChrome
        bare={bare}
        list={points}
        selected={selected}
        selectedId={selectedId}
        full={full}
        onSelect={onSelect}
        onOpen={onOpen}
        onUseLocation={onUseLocation}
        onZoomIn={() => changeZoom(0.2)}
        onZoomOut={() => changeZoom(-0.2)}
        onFit={() => setZoom(1)}
        onToggleFull={() => setFull((v) => !v)}
      />
    </div>
  );
  const body = useGoogle ? (
    <GoogleMapBody
      pins={pins}
      selectedId={selectedId}
      onSelect={onSelect}
      onOpen={onOpen}
      userLocation={userLocation}
      onUseLocation={onUseLocation}
      onMapClick={onMapClick}
      full={full}
      setFull={setFull}
      bare={bare}
      onError={() => setGoogleFailed(true)}
    />
  ) : useDgis ? (
    <DgisMapBody
      pins={pins}
      selectedId={selectedId}
      onSelect={onSelect}
      onOpen={onOpen}
      userLocation={userLocation}
      onUseLocation={onUseLocation}
      onMapClick={onMapClick}
      full={full}
      setFull={setFull}
      bare={bare}
      onError={() => setDgisFailed(true)}
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

  return <div className={bare ? "relative h-full" : "relative mt-1 h-[260px]"}>{body}</div>;
}

// Provider map markers (2GIS/Google) take a flat image URL and render it as a
// square. To match the round pins everywhere else, we pre-render each logo into a
// circular PNG (clipped + white ring) on a canvas and hand that data URL to the
// marker. Cached by url+size so we only rasterize once per logo.
const CIRCLE_ICON_CACHE = new Map<string, string>();

function circularizeIcon(url: string, size: number, dpr = 2): Promise<string> {
  const key = `${url}@${size}`;
  const cached = CIRCLE_ICON_CACHE.get(key);
  if (cached) return Promise.resolve(cached);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous"; // same-origin /media — keeps the canvas untainted
    img.onload = () => {
      const s = size * dpr;
      const canvas = document.createElement("canvas");
      canvas.width = s;
      canvas.height = s;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(url);
        return;
      }
      const ring = 2 * dpr; // white border matching the CSS pins
      ctx.beginPath();
      ctx.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(s / 2, s / 2, s / 2 - ring, 0, Math.PI * 2);
      ctx.clip();
      const iw = img.naturalWidth || size;
      const ih = img.naturalHeight || size;
      const scale = Math.max(s / iw, s / ih); // object-fit: cover
      const dw = iw * scale;
      const dh = ih * scale;
      ctx.drawImage(img, (s - dw) / 2, (s - dh) / 2, dw, dh);
      const data = canvas.toDataURL("image/png");
      CIRCLE_ICON_CACHE.set(key, data);
      resolve(data);
    };
    img.onerror = () => resolve(url); // fall back to the raw url on decode failure
    img.src = url;
  });
}

/** Rasterizes each pin's logo into a circular marker icon; returns id → data URL. */
function useCircularPinIcons(pins: MapPin[], size: number): Record<string, string> {
  const [icons, setIcons] = useState<Record<string, string>>({});
  // Stable signature so the effect only re-runs when the set of logos changes.
  const sig = pins.map((p) => `${p.id}:${p.logoUrl ?? ""}`).join("|");
  useEffect(() => {
    let cancelled = false;
    const withLogo = pins.filter((p) => p.logoUrl);
    if (withLogo.length === 0) return;
    Promise.all(
      withLogo.map(async (p) => [p.id, await circularizeIcon(p.logoUrl as string, size)] as const),
    ).then((entries) => {
      if (!cancelled) setIcons((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, size]);
  return icons;
}

function DgisMapBody({
  pins,
  selectedId,
  onSelect,
  onOpen,
  userLocation,
  onUseLocation,
  onMapClick,
  full,
  setFull,
  bare,
  onError,
}: {
  pins: MapPin[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  onOpen?: (id: string) => void;
  userLocation?: UserLocation;
  onUseLocation?: () => void;
  onMapClick?: () => void;
  full: boolean;
  setFull: (next: boolean | ((current: boolean) => boolean)) => void;
  bare: boolean;
  onError: () => void;
}) {
  const t = useT();
  const mapEl = useRef<HTMLDivElement>(null);
  const map = useRef<DgisMap | null>(null);
  const markers = useRef<DgisMarker[]>([]);
  const userMarker = useRef<DgisMarker | null>(null);
  // Keep the latest click handlers without re-creating markers when the parent re-renders.
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;
  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;
  const selected = pins.find((p) => p.id === selectedId) ?? pins[0] ?? null;
  const circleIcons = useCircularPinIcons(pins, 40);

  useEffect(() => {
    let cancelled = false;
    loadMapgl()
      .then((mapgl) => {
        if (cancelled || !mapEl.current || map.current) return;
        if (!mapgl?.Map) throw new Error("2GIS MapGL did not initialize");
        const center = userLocation ?? pinCenter(pins) ?? BISHKEK;
        map.current = new mapgl.Map(mapEl.current, {
          key: DGIS_KEY,
          // MapGL takes [lng, lat], the opposite of Google's {lat, lng}.
          center: [center.lng, center.lat],
          zoom: pins.length > 1 ? 13 : 15,
          // We render our own controls, so hide MapGL's built-in ones.
          zoomControl: false,
        });
        // Tapping the map background (not a marker) unfolds the browse list.
        map.current.on("click", () => onMapClickRef.current?.());
      })
      .catch(onError);
    return () => {
      cancelled = true;
      markers.current.forEach((m) => m.destroy());
      markers.current = [];
      userMarker.current?.destroy();
      userMarker.current = null;
      map.current?.destroy();
      map.current = null;
    };
    // Mount once; marker/center updates happen in the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const currentMap = map.current;
    const mapgl = (window as any).mapgl;
    if (!currentMap || !mapgl?.Marker) return;

    markers.current.forEach((m) => m.destroy());
    markers.current = [];

    pins.forEach((pin) => {
      if (typeof pin.lat !== "number" || typeof pin.lng !== "number") return;
      const active = pin.id === selectedId || (!selectedId && !!pin.closest);
      const marker = new mapgl.Marker(currentMap, {
        coordinates: [pin.lng, pin.lat],
        // Circular business-logo marker once rasterized; branded initial pin until
        // the logo finishes rendering (or when the business has no logo).
        icon:
          pin.logoUrl && circleIcons[pin.id]
            ? circleIcons[pin.id]
            : pinIcon(pin.initial, pin.accent || "#C25E3C", active),
        size: active ? [42, 42] : [36, 36],
        anchor: active ? [21, 21] : [18, 18],
        zIndex: active ? 20 : 10,
      });
      marker.on("click", () =>
        onOpenRef.current ? onOpenRef.current(pin.id) : onSelectRef.current?.(pin.id),
      );
      markers.current.push(marker);
    });

    userMarker.current?.destroy();
    userMarker.current = null;
    if (userLocation) {
      userMarker.current = new mapgl.Marker(currentMap, {
        coordinates: [userLocation.lng, userLocation.lat],
        icon: USER_ICON,
        size: [22, 22],
        anchor: [11, 11],
        zIndex: 30,
      });
    }

    fitDgisMap(currentMap, pins, userLocation);
  }, [pins, selectedId, userLocation, circleIcons]);

  function zoomBy(delta: number) {
    if (!map.current) return;
    map.current.setZoom(Math.max(3, Math.min(20, (map.current.getZoom() ?? 13) + delta)));
  }

  function fit() {
    if (map.current) fitDgisMap(map.current, pins, userLocation);
  }

  return (
    <div className={cn("relative h-full overflow-hidden bg-[#EEE6D6]", !bare && "rounded-[22px] border border-line")}>
      <div ref={mapEl} className="absolute inset-0" />

      <MapChrome
        bare={bare}
        list={pins}
        selected={selected}
        selectedId={selectedId}
        full={full}
        onSelect={onSelect}
        onOpen={onOpen}
        onUseLocation={onUseLocation}
        onZoomIn={() => zoomBy(1)}
        onZoomOut={() => zoomBy(-1)}
        onFit={fit}
        onToggleFull={() => setFull((v) => !v)}
      />
    </div>
  );
}

function GoogleMapBody({
  pins,
  selectedId,
  onSelect,
  onOpen,
  userLocation,
  onUseLocation,
  onMapClick,
  full,
  setFull,
  bare,
  onError,
}: {
  pins: MapPin[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  onOpen?: (id: string) => void;
  userLocation?: UserLocation;
  onUseLocation?: () => void;
  onMapClick?: () => void;
  full: boolean;
  setFull: (next: boolean | ((current: boolean) => boolean)) => void;
  bare: boolean;
  onError: () => void;
}) {
  const t = useT();
  const mapEl = useRef<HTMLDivElement>(null);
  const map = useRef<GoogleMap | null>(null);
  const markers = useRef<GoogleMarker[]>([]);
  const userDot = useRef<any>(null);
  const infoWindow = useRef<any>(null);
  const clusterer = useRef<any>(null);
  const selected = pins.find((p) => p.id === selectedId) ?? pins[0] ?? null;
  const circleIcons = useCircularPinIcons(pins, 40);
  // Keep the latest handler without re-creating the map on every render.
  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;

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
          zoomControl: !bare,
          clickableIcons: false,
          gestureHandling: "greedy",
          styles: WARM_MAP_STYLE,
        });
        // Tapping the map background (not a marker) unfolds the browse list.
        map.current.addListener("click", () => onMapClickRef.current?.());
      })
      .catch(onError);
    return () => {
      cancelled = true;
      (window as any).gm_authFailure = previousAuthFailure;
    };
  }, [bare, onError, pins, userLocation]);

  useEffect(() => {
    const currentMap = map.current;
    const google = (window as any).google;
    if (!currentMap || !google?.maps) return;

    // Tear down the previous render: clusterer first (it owns marker→map), then
    // any stragglers, so re-renders never leak markers onto the map.
    clusterer.current?.clearMarkers();
    markers.current.forEach((m) => m.setMap(null));
    markers.current = [];
    if (!infoWindow.current) {
      // Single reused tooltip; disableAutoPan so hovering never jerks the map.
      infoWindow.current = new google.maps.InfoWindow({ disableAutoPan: true });
    }

    pins.forEach((pin) => {
      if (typeof pin.lat !== "number" || typeof pin.lng !== "number") return;
      const active = pin.id === selectedId || (!selectedId && pin.closest);
      // Circular business-logo marker once rasterized (same-origin /media url);
      // branded initial-in-circle symbol until the logo renders or when absent.
      const logoSize = active ? 42 : 34;
      const circleIcon = pin.logoUrl ? circleIcons[pin.id] : undefined;
      const marker = new google.maps.Marker({
        // No `map` here: the clusterer assigns markers to the map and replaces
        // overlapping ones with a single count bubble as you zoom out.
        position: { lat: pin.lat, lng: pin.lng },
        title: pin.name,
        ...(circleIcon
          ? {
              icon: {
                url: circleIcon,
                scaledSize: new google.maps.Size(logoSize, logoSize),
                anchor: new google.maps.Point(logoSize / 2, logoSize / 2),
              },
            }
          : {
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
            }),
        zIndex: active ? 20 : 10,
      });
      marker.addListener("click", () => (onOpen ? onOpen(pin.id) : onSelect?.(pin.id)));
      // Hover → show a details tooltip; leave → close it.
      marker.addListener("mouseover", () => {
        infoWindow.current.setContent(pinInfoHtml(pin));
        infoWindow.current.open(currentMap, marker);
      });
      marker.addListener("mouseout", () => infoWindow.current.close());
      markers.current.push(marker);
    });

    // Cluster overlapping markers into one count bubble; clicking a cluster zooms
    // in (default behaviour). The bubble is a brand-coloured circle that grows
    // slightly with the count, with the number baked in as the marker label.
    clusterer.current = new MarkerClusterer({
      map: currentMap,
      markers: markers.current,
      renderer: {
        render: ({ count, position }: { count: number; position: any }) =>
          new google.maps.Marker({
            position,
            zIndex: 1000 + count,
            label: {
              text: String(count),
              color: "#ffffff",
              fontSize: "13px",
              fontWeight: "800",
              fontFamily: "Bricolage Grotesque, sans-serif",
            },
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: 15 + Math.min(count, 25), // grows with size, capped
              fillColor: "#C25E3C", // brand terracotta
              fillOpacity: 0.95,
              strokeColor: "#ffffff",
              strokeWeight: 3,
            },
          }),
      },
    });

    if (userDot.current) userDot.current.setMap(null);
    userDot.current = null;
    if (userLocation) {
      // Live, animated orange "you are here" dot (custom overlay, not a static marker).
      userDot.current = createUserDot(google, userLocation);
      userDot.current.setMap(currentMap);
    }

    fitGoogleMap(currentMap, pins, userLocation);
  }, [pins, selectedId, onSelect, onOpen, userLocation, t, circleIcons]);

  function zoomBy(delta: number) {
    if (!map.current) return;
    map.current.setZoom(Math.max(3, Math.min(20, (map.current.getZoom() ?? 13) + delta)));
  }

  function fit() {
    if (map.current) fitGoogleMap(map.current, pins, userLocation);
  }

  return (
    <div className={cn("relative h-full overflow-hidden bg-[#EEE6D6]", !bare && "rounded-[22px] border border-line")}>
      <div ref={mapEl} className="absolute inset-0" />

      <MapChrome
        bare={bare}
        list={pins}
        selected={selected}
        selectedId={selectedId}
        full={full}
        onSelect={onSelect}
        onOpen={onOpen}
        onUseLocation={onUseLocation}
        onZoomIn={() => zoomBy(1)}
        onZoomOut={() => zoomBy(-1)}
        onFit={fit}
        onToggleFull={() => setFull((v) => !v)}
      />
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

/**
 * In-map overlay chrome shared by all three map bodies (fallback / 2GIS /
 * Google): zoom + fit + recenter + full-screen toggle, the selected-business
 * card and the full-screen list. Extracted so the three bodies don't each carry
 * an identical copy. In `bare` mode (full-bleed Nearby map) the host screen owns
 * the controls, so only a single recenter button is kept.
 */
function MapChrome({
  bare,
  list,
  selected,
  selectedId,
  full,
  onSelect,
  onOpen,
  onUseLocation,
  onZoomIn,
  onZoomOut,
  onFit,
  onToggleFull,
}: {
  bare: boolean;
  list: MapPin[];
  selected: MapPin | null;
  selectedId?: string | null;
  full: boolean;
  onSelect?: (id: string) => void;
  onOpen?: (id: string) => void;
  onUseLocation?: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onToggleFull: () => void;
}) {
  const t = useT();

  if (bare) {
    // Only a recenter affordance — losing the way back to "you" after panning is
    // a real regression. Pinch-zoom and drag stay native on the real-map bodies.
    return onUseLocation ? (
      <button
        type="button"
        onClick={onUseLocation}
        aria-label={t("nearby.you")}
        className="absolute bottom-3 right-3 z-20 grid h-11 w-11 place-items-center rounded-full bg-card text-lg shadow-card transition active:scale-95"
      >
        ◎
      </button>
    ) : null;
  }

  return (
    <>
      <div className="absolute left-3 top-3 z-20 flex gap-1.5">
        <MapButton label="+" onClick={onZoomIn} />
        <MapButton label="-" onClick={onZoomOut} />
        <MapButton label="Fit" onClick={onFit} />
      </div>
      <div className="absolute right-3 top-3 z-20 flex gap-1.5">
        {onUseLocation && <MapButton label={t("nearby.you")} onClick={onUseLocation} />}
        <MapButton label={full ? "Close" : "Full"} onClick={onToggleFull} />
      </div>

      {selected && (
        <button
          type="button"
          onClick={() => (onOpen ? onOpen(selected.id) : onSelect?.(selected.id))}
          className="absolute bottom-3 left-3 right-3 z-20 flex items-center gap-3 rounded-[14px] border border-line bg-card/95 p-3 text-left shadow-card backdrop-blur transition active:scale-[.99]"
        >
          <PinLogo logoUrl={selected.logoUrl} initial={selected.initial} size={40} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="truncate text-sm font-bold text-ink">{selected.name}</span>
              {selected.open != null && (
                <Badge tone={selected.open ? "ok" : "neutral"}>
                  {selected.open ? t("nearby.open") : t("nearby.closed")}
                </Badge>
              )}
              {selected.closest && <Badge tone="brand">{t("nearby.nearest")}</Badge>}
            </div>
            <div className="mt-0.5 truncate text-xs font-semibold text-subtle">
              {selected.category || t("nearby.title")}
              {selected.dist ? ` · ${selected.dist}` : ""}
            </div>
            {selected.reward && (
              <div className="mt-0.5 truncate text-xs font-semibold text-brand">{selected.reward}</div>
            )}
          </div>
          <span className="flex-none text-subtle" aria-hidden>›</span>
        </button>
      )}

      {full && list.length > 0 && (
        <div className="absolute bottom-20 left-3 right-3 z-20 flex gap-2 overflow-x-auto pb-1 lg:left-auto lg:top-16 lg:w-64 lg:flex-col lg:overflow-y-auto">
          {list.map((p) => (
            <button
              key={p.id}
              onClick={() => (onOpen ? onOpen(p.id) : onSelect?.(p.id))}
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
    </>
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

function loadMapgl(): Promise<any> {
  const existing = (window as any).mapgl;
  if (existing?.Map) return Promise.resolve(existing);
  if (mapglPromise) return mapglPromise;
  mapglPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    // 2GIS MapGL JS API v1 loader; attaches the global `mapgl`.
    script.src = "https://mapgl.2gis.com/api/js/v1";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve((window as any).mapgl);
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return mapglPromise;
}

// A live, pulsing orange "you are here" dot. Implemented as a Google OverlayView (rather
// than a static Marker) so we can run a CSS/WAAPI animation on a real DOM node — Marker
// icons are rasterized and can't animate.
function createUserDot(google: any, location: { lat: number; lng: number }): any {
  class UserDot extends google.maps.OverlayView {
    div: HTMLDivElement | null = null;
    position = new google.maps.LatLng(location.lat, location.lng);
    onAdd(): void {
      const div = document.createElement("div");
      Object.assign(div.style, { position: "absolute", transform: "translate(-50%, -50%)", pointerEvents: "none" });

      const ring = document.createElement("span");
      Object.assign(ring.style, {
        position: "absolute", left: "0", top: "0", width: "18px", height: "18px",
        marginLeft: "-9px", marginTop: "-9px", borderRadius: "9999px",
        background: USER_DOT_COLOR, opacity: "0.45",
      });
      // Expanding pulse ring — the "live" feel. Web Animations API, no CSS injection needed.
      ring.animate(
        [{ transform: "scale(1)", opacity: 0.5 }, { transform: "scale(3)", opacity: 0 }],
        { duration: 1600, iterations: Infinity, easing: "ease-out" },
      );

      const core = document.createElement("span");
      Object.assign(core.style, {
        position: "absolute", left: "0", top: "0", width: "16px", height: "16px",
        marginLeft: "-8px", marginTop: "-8px", borderRadius: "9999px",
        background: USER_DOT_COLOR, border: "3px solid #ffffff", boxShadow: "0 1px 5px rgba(0,0,0,.35)",
      });
      // Gentle breathing of the solid core for extra liveliness.
      core.animate(
        [{ transform: "scale(1)" }, { transform: "scale(1.18)" }, { transform: "scale(1)" }],
        { duration: 1600, iterations: Infinity, easing: "ease-in-out" },
      );

      div.append(ring, core);
      this.div = div;
      this.getPanes()!.overlayLayer.appendChild(div);
    }
    draw(): void {
      const point = this.getProjection()?.fromLatLngToDivPixel(this.position);
      if (this.div && point) {
        this.div.style.left = `${point.x}px`;
        this.div.style.top = `${point.y}px`;
      }
    }
    onRemove(): void {
      this.div?.remove();
      this.div = null;
    }
  }
  return new UserDot();
}

// Hover-tooltip markup for a business pin: name, then category · distance, then reward.
function pinInfoHtml(pin: MapPin): string {
  const meta = [pin.category, pin.dist].filter(Boolean).map((s) => escapeXml(String(s))).join(" · ");
  const reward = pin.reward
    ? `<div style="font-size:11px;font-weight:700;color:#C25E3C;margin-top:3px">${escapeXml(pin.reward)}</div>`
    : "";
  return (
    `<div style="font-family:'Bricolage Grotesque',sans-serif;min-width:128px;padding:1px 2px 2px">` +
    `<div style="font-weight:800;font-size:13px;color:#2b241d">${escapeXml(pin.name)}</div>` +
    (meta ? `<div style="font-size:11px;color:#857a6b;margin-top:1px">${meta}</div>` : "") +
    reward +
    `</div>`
  );
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
  // Hide Google's own POI markers/labels (shops, cafes, etc.) so only OUR business
  // pins appear on the map. Keep park geometry for context, drop business POIs + transit.
  { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "poi.business", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#e7dcc9" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#dce7d7" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#fff8ee" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#e2d4bf" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#cbd9d6" }] },
];

function pinCenter(pins: MapPin[]): { lat: number; lng: number } | null {
  const geo = pins.filter((p) => typeof p.lat === "number" && typeof p.lng === "number");
  if (geo.length === 0) return null;
  return {
    lat: geo.reduce((sum, p) => sum + (p.lat as number), 0) / geo.length,
    lng: geo.reduce((sum, p) => sum + (p.lng as number), 0) / geo.length,
  };
}

function fitDgisMap(map: DgisMap, pins: MapPin[], userLocation?: UserLocation) {
  const coords: Array<[number, number]> = [];
  if (userLocation) coords.push([userLocation.lng, userLocation.lat]);
  pins.forEach((p) => {
    if (typeof p.lat === "number" && typeof p.lng === "number") coords.push([p.lng, p.lat]);
  });

  if (coords.length === 0) {
    map.setCenter([BISHKEK.lng, BISHKEK.lat]);
    map.setZoom(13);
    return;
  }
  if (coords.length === 1) {
    map.setCenter(coords[0]!);
    map.setZoom(15);
    return;
  }
  const lngs = coords.map((c) => c[0]);
  const lats = coords.map((c) => c[1]);
  // MapGL fitBounds takes a {southWest, northEast} box in [lng, lat] order.
  map.fitBounds(
    { southWest: [Math.min(...lngs), Math.min(...lats)], northEast: [Math.max(...lngs), Math.max(...lats)] },
    { padding: { top: 56, right: 56, bottom: 90, left: 56 } },
  );
}

// Brand circular pin with up to two initials, baked into an inline SVG so it works as a
// MapGL marker icon (which accepts an image URL / data URI). Active pins are larger and
// filled with the business accent; inactive pins are white with a terracotta glyph.
function pinIcon(initial: string, accent: string, active: boolean): string {
  const bg = active ? accent : "#ffffff";
  const fg = active ? "#ffffff" : "#C25E3C";
  const size = active ? 42 : 36;
  const r = (active ? 36 : 30) / 2;
  const c = size / 2;
  const text = escapeXml(initial.slice(0, 2));
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<circle cx="${c}" cy="${c}" r="${r}" fill="${bg}" stroke="#ffffff" stroke-width="3"/>` +
    `<text x="${c}" y="${c}" text-anchor="middle" dominant-baseline="central" ` +
    `font-family="Bricolage Grotesque, sans-serif" font-weight="800" font-size="${active ? 15 : 13}" ` +
    `fill="${fg}">${text}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// Orange "you are here" dot for 2GIS (static; the animated overlay is Google-only).
const USER_ICON = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">` +
    `<circle cx="11" cy="11" r="9" fill="${USER_DOT_COLOR}" stroke="#ffffff" stroke-width="4"/></svg>`,
)}`;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
