"use client";

import { AUTH_EVENT, tokenStore, useMe, type Area } from "@jaqyn/api";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const DEFAULT_PATH: Record<Area, string> = {
  business: "/business/dashboard",
  staff: "/staff/scan",
  customer: "/",
};

/** Reactive auth state — re-renders on login/logout (tokenStore emits AUTH_EVENT). */
export function useAuth() {
  const [authed, setAuthed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sync = () => setAuthed(tokenStore.isAuthenticated());
    sync();
    setReady(true);
    window.addEventListener(AUTH_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(AUTH_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return { isAuthenticated: authed, ready, logout: () => tokenStore.clear() };
}

/** Redirect to /login (preserving return URL) when unauthenticated. */
export function useRequireAuth() {
  const { isAuthenticated, ready } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (ready && !isAuthenticated) {
      router.replace(`/login?return=${encodeURIComponent(pathname)}`);
    }
  }, [ready, isAuthenticated, router, pathname]);

  return { isAuthenticated, ready };
}

/**
 * Guard a route segment to a specific area.
 * - Unauthenticated → /login?return=[pathname]
 * - Wrong area      → that user's default page
 * Returns { allowed } — render nothing until true.
 */
export function useRequireArea(required: Area) {
  const { isAuthenticated, ready } = useAuth();
  const me = useMe(ready && isAuthenticated);
  const router = useRouter();
  const pathname = usePathname();

  const meReady = ready && isAuthenticated && !me.isLoading && me.data !== undefined;
  const area = me.data?.area;
  const allowed = meReady && area === required;

  useEffect(() => {
    if (!ready) return;
    if (!isAuthenticated) {
      router.replace(`/login?return=${encodeURIComponent(pathname)}`);
      return;
    }
    if (!meReady) return;
    if (area !== required) {
      router.replace(DEFAULT_PATH[area ?? "customer"]);
    }
  }, [ready, isAuthenticated, meReady, area, required, router, pathname]);

  return { allowed };
}
