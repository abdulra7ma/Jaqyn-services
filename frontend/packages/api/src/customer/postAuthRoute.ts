import type { Area, AuthResult } from "./types";

/** Console landing page for owner/staff; customers fall through to the return URL. */
function areaPath(area: Area, returnTo: string): string {
  if (area === "business") return "/business/dashboard";
  if (area === "staff") return "/staff";
  return returnTo || "/";
}

/**
 * Canonical post-auth landing decision, shared by every auth entry point.
 * Priority:
 *  1. customer with profile_completed === false -> /signup/complete (fill required info)
 *  2. customer who is new or hasn't finished the tour -> /onboarding
 *  3. staff with profile_completed === false -> /staff/onboarding (onboard new staff)
 *  4. otherwise -> area console / return URL
 */
export function postAuthRoute(r: AuthResult, returnTo: string): string {
  if (r.area === "customer" && r.profile_completed === false) {
    return "/signup/complete";
  }
  if (r.area === "customer" && (r.is_new || r.onboarding_completed === false)) {
    return `/onboarding?return=${encodeURIComponent(returnTo)}`;
  }
  if (r.area === "staff" && r.profile_completed === false) {
    return "/staff/onboarding";
  }
  return areaPath(r.area, returnTo);
}
