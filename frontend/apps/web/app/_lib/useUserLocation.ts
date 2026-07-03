"use client";

import { useEffect, useRef, useState } from "react";

export type UserLocation = { lat: number; lng: number };

/**
 * Returns the user's geolocation once permission is granted, or null until
 * then / if permission is denied / if the browser has no geo support.
 *
 * Semantics:
 *   - null  = not yet known (or denied / unavailable)
 *   - value = last granted position
 *
 * Never throws. SSR-safe (navigator is accessed only inside useEffect).
 * Asks for location exactly once on mount (mirrors the nearby page pattern).
 */
export function useUserLocation(): UserLocation | null {
  const [loc, setLoc] = useState<UserLocation | null>(null);
  const asked = useRef(false);

  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      // Permission denied or unavailable — stay null, no error surfaced.
      () => undefined,
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }, []);

  return loc;
}
