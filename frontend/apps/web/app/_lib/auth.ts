"use client";

import { AUTH_EVENT, tokenStore } from "@jaqyn/api";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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
