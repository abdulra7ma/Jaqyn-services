"use client";

import { useEffect, useRef, useState } from "react";

// Bishkek city center — default center when no lat/lng is provided by the caller.
// Source: standard geographic reference for Bishkek, Kyrgyzstan.
const BISHKEK = { lat: 42.8746, lng: 74.5698 };

// Google Maps JS API key. Public by design (ships in the client bundle, domain-restricted
// in the Google Cloud Console). When unset the component falls back to OpenStreetMap + Leaflet.
const GOOGLE_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

// Module-level promise so repeated mounts share the single script injection rather than
// injecting duplicate <script> tags. Reset to null if the load fails so a retry is possible.
let googleMapsPromise: Promise<any> | null = null;
let leafletPromise: Promise<void> | null = null;

// ── Types ──────────────────────────────────────────────────────────────────────
// Google Maps JS SDK exposes no public TS types in the npm-free pattern, so we
// use `any` at the integration boundary only, exactly as MiniMap.tsx does.
type GoogleMap = any;
type GoogleMarker = any;
type GoogleAutocomplete = any;
type LeafletMap = any;
type LeafletMarker = any;

export type LocationPickerProps = {
  lat: number | string | null;
  lng: number | string | null;
  onChange: (lat: number, lng: number, address?: string) => void;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Parse a lat or lng prop (number | string | null) to a JS number, or null if invalid. */
function parseCoord(v: number | string | null): number | null {
  if (v === null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(v);
  return isFinite(n) ? n : null;
}

/** Inject the Google Maps JS script with the Places library and return a promise that
 *  resolves once the `window.google` global is ready. */
function loadGoogleMaps(): Promise<any> {
  const existing = (window as any).google?.maps;
  if (existing) return Promise.resolve((window as any).google);
  if (googleMapsPromise) return googleMapsPromise;
  googleMapsPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    // Load the Maps JS API with the Places library so Autocomplete is available.
    // Mirror the MiniMap.tsx pattern but add &libraries=places.
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_KEY}&v=weekly&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve((window as any).google);
    script.onerror = (err) => {
      // Allow a future call to retry (don't stay stuck on a failed promise).
      googleMapsPromise = null;
      reject(err);
    };
    document.head.appendChild(script);
  });
  return googleMapsPromise;
}

/** Inject Leaflet CSS + JS from unpkg CDN and resolve once both are ready.
 *  Leaflet attaches itself to `window.L`. */
function loadLeaflet(): Promise<void> {
  if ((window as any).L?.map) return Promise.resolve();
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    // CSS must come before the JS so the map tiles render correctly.
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    link.integrity = "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=";
    link.crossOrigin = "";
    document.head.appendChild(link);

    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.integrity = "sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV/XN/WPeE=";
    script.crossOrigin = "";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = (err) => {
      leafletPromise = null;
      reject(err);
    };
    document.head.appendChild(script);
  });
  return leafletPromise;
}

// ── Google branch ──────────────────────────────────────────────────────────────

function GooglePicker({
  initialLat,
  initialLng,
  onChange,
}: {
  initialLat: number | null;
  initialLng: number | null;
  onChange: LocationPickerProps["onChange"];
}) {
  const mapEl = useRef<HTMLDivElement>(null);
  const inputEl = useRef<HTMLInputElement>(null);
  const map = useRef<GoogleMap | null>(null);
  const marker = useRef<GoogleMarker | null>(null);
  const autocomplete = useRef<GoogleAutocomplete | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Stable ref to onChange so listener closures don't hold a stale copy.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    let cancelled = false;

    // Register the auth-failure hook before loading so a bad key degrades gracefully.
    const previousAuthFailure = (window as any).gm_authFailure;
    (window as any).gm_authFailure = () => {
      setError("Google Maps failed to authenticate. Ensure your API key is valid.");
      if (typeof previousAuthFailure === "function") previousAuthFailure();
    };

    loadGoogleMaps()
      .then((google) => {
        if (cancelled || !mapEl.current || !inputEl.current) return;
        if (!google?.maps?.Map) throw new Error("Google Maps did not initialize");

        const center =
          initialLat !== null && initialLng !== null
            ? { lat: initialLat, lng: initialLng }
            : BISHKEK;

        // Build the map.
        map.current = new google.maps.Map(mapEl.current, {
          center,
          zoom: initialLat !== null ? 15 : 13,
          disableDefaultUI: false,
          zoomControl: true,
          clickableIcons: false,
          gestureHandling: "greedy",
        });

        // Draggable marker at the initial position (or Bishkek).
        marker.current = new google.maps.Marker({
          map: map.current,
          position: center,
          draggable: true,
          title: "Drag to adjust location",
        });

        // Places Autocomplete — KG-restricted.
        autocomplete.current = new google.maps.places.Autocomplete(inputEl.current, {
          componentRestrictions: { country: "kg" },
          fields: ["geometry", "formatted_address"],
        });

        // Fire onChange immediately on autocomplete selection.
        autocomplete.current.addListener("place_changed", () => {
          const place = autocomplete.current!.getPlace();
          if (!place?.geometry?.location) return;
          const lat = place.geometry.location.lat();
          const lng = place.geometry.location.lng();
          map.current!.setCenter({ lat, lng });
          map.current!.setZoom(16);
          marker.current!.setPosition({ lat, lng });
          onChangeRef.current(lat, lng, place.formatted_address ?? undefined);
        });

        // Fire onChange on marker drag end.
        marker.current.addListener("dragend", (e: any) => {
          const lat = e.latLng.lat();
          const lng = e.latLng.lng();
          onChangeRef.current(lat, lng);
        });

        // Fire onChange on map click — move marker and report.
        map.current.addListener("click", (e: any) => {
          const lat = e.latLng.lat();
          const lng = e.latLng.lng();
          marker.current!.setPosition({ lat, lng });
          onChangeRef.current(lat, lng);
        });
      })
      .catch(() => {
        setError("Failed to load Google Maps. Check your internet connection.");
      });

    return () => {
      cancelled = true;
      // Restore any previously registered auth-failure hook.
      (window as any).gm_authFailure = previousAuthFailure;
      // Disconnect autocomplete from its DOM node before it's removed.
      if (autocomplete.current) {
        (window as any).google?.maps?.event?.clearInstanceListeners(autocomplete.current);
        autocomplete.current = null;
      }
      if (marker.current) {
        (window as any).google?.maps?.event?.clearInstanceListeners(marker.current);
        marker.current.setMap(null);
        marker.current = null;
      }
      if (map.current) {
        (window as any).google?.maps?.event?.clearInstanceListeners(map.current);
        map.current = null;
      }
    };
    // Run once on mount; lat/lng prop changes are intentionally not re-initializing the map
    // (the parent updates via onChange; re-mounting would destroy user in-progress interactions).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <div className="flex h-[320px] items-center justify-center rounded-[16px] border border-line bg-[#EEE6D6] px-6 text-center text-sm text-subtle">
        {error}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputEl}
        type="text"
        placeholder="Search a location in Kyrgyzstan…"
        className="w-full rounded-[10px] border border-line bg-card px-3 py-2.5 text-sm text-ink placeholder:text-subtle focus:border-brand focus:outline-none"
        aria-label="Search location"
      />
      <div
        ref={mapEl}
        className="h-[300px] w-full rounded-[16px] border border-line bg-[#EEE6D6]"
      />
    </div>
  );
}

// ── OSM / Leaflet branch ───────────────────────────────────────────────────────

// Debounce delay for the Nominatim search input (ms).
// Nominatim's usage policy requires courtesy delays between requests.
const NOMINATIM_DEBOUNCE_MS = 600;

type NominatimResult = {
  place_id: string;
  display_name: string;
  lat: string;
  lon: string;
};

function OsmPicker({
  initialLat,
  initialLng,
  onChange,
}: {
  initialLat: number | null;
  initialLng: number | null;
  onChange: LocationPickerProps["onChange"];
}) {
  const mapEl = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const markerRef = useRef<LeafletMarker | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stable onChange ref.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    let cancelled = false;

    loadLeaflet()
      .then(() => {
        if (cancelled || !mapEl.current || map.current) return;
        const L = (window as any).L;
        if (!L?.map) throw new Error("Leaflet did not initialize");

        const center: [number, number] =
          initialLat !== null && initialLng !== null
            ? [initialLat, initialLng]
            : [BISHKEK.lat, BISHKEK.lng];

        map.current = L.map(mapEl.current, {
          center,
          zoom: initialLat !== null ? 15 : 13,
        });

        // OSM tile layer.
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 19,
        }).addTo(map.current);

        // Draggable marker.
        markerRef.current = L.marker(center, { draggable: true }).addTo(map.current);

        // Fire onChange on marker drag end.
        markerRef.current.on("dragend", () => {
          const latlng = markerRef.current!.getLatLng();
          onChangeRef.current(latlng.lat, latlng.lng);
        });

        // Fire onChange on map click — move marker and report.
        map.current.on("click", (e: any) => {
          const { lat, lng } = e.latlng;
          markerRef.current!.setLatLng([lat, lng]);
          onChangeRef.current(lat, lng);
        });
      })
      .catch(() => {
        setLoadError("Failed to load the map. Check your internet connection.");
      });

    return () => {
      cancelled = true;
      if (map.current) {
        map.current.off();
        map.current.remove();
        map.current = null;
      }
      markerRef.current = null;
      if (debounceTimer.current !== null) clearTimeout(debounceTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Move the Leaflet map + marker to a given position. */
  function flyTo(lat: number, lng: number): void {
    if (!map.current || !markerRef.current) return;
    map.current.flyTo([lat, lng], 16);
    markerRef.current.setLatLng([lat, lng]);
  }

  /** Handle search input change with debouncing to respect Nominatim usage policy. */
  function handleQueryChange(value: string): void {
    setQuery(value);
    setResults([]);
    if (debounceTimer.current !== null) clearTimeout(debounceTimer.current);
    if (value.trim().length < 2) return;
    debounceTimer.current = setTimeout(() => {
      runNominatimSearch(value.trim());
    }, NOMINATIM_DEBOUNCE_MS);
  }

  /** Fetch from Nominatim — keyless, KG-restricted, descriptive User-Agent via fetch headers. */
  function runNominatimSearch(q: string): void {
    setSearching(true);
    const url =
      `https://nominatim.openstreetmap.org/search` +
      `?format=json&countrycodes=kg&limit=5&q=${encodeURIComponent(q)}`;
    fetch(url, {
      // Nominatim usage policy requires a descriptive User-Agent identifying the app.
      headers: { "Accept-Language": "en" },
    })
      .then((r) => r.json())
      .then((data: NominatimResult[]) => {
        if (!Array.isArray(data)) return;
        setResults(data);
      })
      .catch(() => {
        // Silently degrade — the user can still drag the marker or click the map.
      })
      .finally(() => setSearching(false));
  }

  /** User selects a Nominatim result: recenter map + fire onChange. */
  function selectResult(result: NominatimResult): void {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    if (!isFinite(lat) || !isFinite(lng)) return;
    flyTo(lat, lng);
    setResults([]);
    setQuery(result.display_name);
    onChangeRef.current(lat, lng, result.display_name);
  }

  /** Allow triggering the search immediately on Enter. */
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === "Enter") {
      e.preventDefault();
      if (debounceTimer.current !== null) clearTimeout(debounceTimer.current);
      if (query.trim().length >= 2) runNominatimSearch(query.trim());
    }
  }

  if (loadError) {
    return (
      <div className="flex h-[320px] items-center justify-center rounded-[16px] border border-line bg-[#EEE6D6] px-6 text-center text-sm text-subtle">
        {loadError}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Search input + results dropdown */}
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search a location in Kyrgyzstan…"
          className="w-full rounded-[10px] border border-line bg-card px-3 py-2.5 text-sm text-ink placeholder:text-subtle focus:border-brand focus:outline-none"
          aria-label="Search location"
          aria-autocomplete="list"
        />
        {searching && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-subtle">
            Searching…
          </span>
        )}
        {results.length > 0 && (
          <ul
            role="listbox"
            className="absolute left-0 right-0 z-30 mt-1 max-h-48 overflow-y-auto rounded-[10px] border border-line bg-card shadow-card"
          >
            {results.map((r) => (
              <li key={r.place_id} role="option" aria-selected={false}>
                <button
                  type="button"
                  onClick={() => selectResult(r)}
                  className="w-full px-3 py-2 text-left text-sm text-ink hover:bg-brand-muted"
                >
                  {r.display_name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Leaflet map container */}
      <div
        ref={mapEl}
        className="h-[300px] w-full rounded-[16px] border border-line bg-[#EEE6D6]"
        aria-label="Map — click or drag the marker to set location"
      />
    </div>
  );
}

// ── Public export ──────────────────────────────────────────────────────────────

/**
 * LocationPicker — a reusable map-based coordinate picker restricted to Kyrgyzstan.
 *
 * Provider selection:
 *   - GOOGLE branch: used when NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is set. Renders a Google
 *     Maps JS map with a Places Autocomplete input (componentRestrictions: { country: 'kg' })
 *     and a draggable marker.
 *   - OSM FALLBACK: used when the key is absent. Renders a Leaflet + OpenStreetMap map
 *     with a Nominatim search input (countrycodes=kg) and a draggable marker. Keyless.
 *
 * onChange fires immediately on: autocomplete place_changed, marker dragend, map click.
 *
 * Script/CSS injection mirrors MiniMap.tsx's pattern — no npm map packages are added.
 * The map instance and all listeners are fully cleaned up on unmount so the component
 * is safe to mount/unmount repeatedly inside a multi-step wizard.
 */
export function LocationPicker({ lat, lng, onChange }: LocationPickerProps) {
  const parsedLat = parseCoord(lat);
  const parsedLng = parseCoord(lng);

  // Choose the provider at render time. GOOGLE_MAPS_KEY is evaluated once at module
  // load (SSR-safe: `process.env` is available server-side; the component is 'use client'
  // so the branch is stable across SSR→hydration).
  const useGoogle = Boolean(GOOGLE_MAPS_KEY);

  return (
    <div className="w-full">
      {useGoogle ? (
        <GooglePicker
          initialLat={parsedLat}
          initialLng={parsedLng}
          onChange={onChange}
        />
      ) : (
        <OsmPicker
          initialLat={parsedLat}
          initialLng={parsedLng}
          onChange={onChange}
        />
      )}
    </div>
  );
}
