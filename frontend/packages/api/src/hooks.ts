"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "./client";
import type { HealthData } from "./types";

/** Hits GET /api/health/ — used by F00 to prove the shared client wiring. */
export function useHealth() {
  return useQuery({
    queryKey: ["health"],
    queryFn: () => api.get<HealthData>("/api/health/", { auth: false }),
  });
}
