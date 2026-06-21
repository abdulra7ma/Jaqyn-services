"use client";

// Reports (OwnerShell design, responsive), wired to /api/business/reports/.
// Renders the backend metric map as labelled stat cards.

import { useBusinessReports } from "@jaqyn/api";
import { OwnerShell } from "../_components/OwnerShell";
import { useAuth } from "../../_lib/auth";

const CARD = "rounded-[18px] border border-line bg-card p-5";

function label(k: string) {
  return k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function BusinessReportsPage() {
  const { isAuthenticated, ready } = useAuth();
  const reports = useBusinessReports();
  const entries = Object.entries(reports.data ?? {});

  return (
    <OwnerShell title="Reports">
      {!ready ? null : !isAuthenticated ? (
        <div className={`${CARD} max-w-md`}>
          <p className="text-sm text-subtle">Sign in to view your reports.</p>
        </div>
      ) : (
        <div className="mx-auto max-w-[900px] animate-[jqIn_.3s_ease]">
          <div className="mb-4 flex gap-1.5">
            {["Today", "This week", "This month"].map((p, i) => (
              <span
                key={p}
                className={`rounded-pill px-3.5 py-2 text-[12.5px] font-semibold ${
                  i === 2 ? "bg-brand text-brand-fg" : "border border-line bg-card text-subtle"
                }`}
              >
                {p}
              </span>
            ))}
          </div>

          {reports.isLoading ? (
            <div className={`${CARD} text-subtle`}>Loading reports…</div>
          ) : entries.length === 0 ? (
            <div className={`${CARD} text-center text-[13.5px] text-subtle`}>No report data yet.</div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              {entries.map(([k, v]) => (
                <div key={k} className={CARD}>
                  <div className="font-display text-[28px] font-extrabold leading-none text-ink sm:text-[32px]">{String(v)}</div>
                  <div className="mt-2.5 text-xs font-semibold text-subtle">{label(k)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </OwnerShell>
  );
}
