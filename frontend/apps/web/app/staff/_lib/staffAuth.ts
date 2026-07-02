"use client";

import { AUTH_EVENT, tokenStore, useMe, type StaffMembership } from "@jaqyn/api";
import { useEffect, useState } from "react";

/** Staff identity is derived from the unified session: a logged-in user whose
 *  resolved area is "staff" (i.e. they have an active staff membership). */
export function useStaffAuth() {
  const [authed, setAuthed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const sync = () => setAuthed(tokenStore.isAuthenticated());
    sync();
    setMounted(true);
    window.addEventListener(AUTH_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(AUTH_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const me = useMe(authed);
  const staff: StaffMembership | null = me.data?.staff ?? null;
  // "Can act as staff" — true for real staff and for an owner working their own
  // till (owner-as-staff). Uses `areas` (multi), not the single landing `area`,
  // which for an owner is "business".
  const areas = me.data?.areas ?? (me.data?.area ? [me.data.area] : []);
  const isStaff = areas.includes("staff");
  const ready = mounted && (!authed || !me.isLoading);

  return { staff, isStaff, ready };
}
