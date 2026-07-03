/**
 * Haversine distance utilities for the discover compact rows.
 *
 * formatDistanceKm renders like the design's examples:
 *   < 1 km  → "{m} m"  (metres, rounded to nearest 10; e.g. "450 m", "800 m")
 *   ≥ 1 km  → "{n} km" (one decimal; e.g. "1.4 km")
 *
 * The "km" unit string comes from the existing `nearby.distance` i18n key.
 * The metres unit "m" uses the new `cmp.distance.m` i18n key.
 */

/** Haversine great-circle distance in kilometres. */
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  // Earth's mean radius in km (WGS-84 approximation used for display purposes).
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h =
    sinDLat * sinDLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinDLng * sinDLng;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

type Translator = (key: string) => string;

/**
 * Formats a distance in km for display.
 *   < 1 km  → "{m} {cmp.distance.m}"  metres rounded to nearest 10
 *   ≥ 1 km  → "{n} {nearby.distance}" one-decimal km
 */
export function formatDistanceKm(km: number, t: Translator): string {
  if (km < 1) {
    // Round metres to nearest 10 (e.g. 445 → 450, 995 → 1000).
    const m = Math.round((km * 1000) / 10) * 10;
    // Edge-case: if rounding pushes to 1000 m, show as 1.0 km instead.
    if (m >= 1000) {
      return `1.0 ${t("nearby.distance")}`;
    }
    return `${m} ${t("cmp.distance.m")}`;
  }
  return `${km.toFixed(1)} ${t("nearby.distance")}`;
}
