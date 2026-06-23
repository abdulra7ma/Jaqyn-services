"use client";

// Auto-join landing (design SOCIAL POST STUDIO auto-join). A customer who taps the
// social post's link lands here: if authenticated, we join them to the campaign and
// redirect to its detail; if not, we bounce to /login with a return URL back here.
// The join runs exactly once via a guard ref so a re-render can't double-fire it.

import { useJoinCampaign } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useAuth } from "../../_lib/auth";
import { useErrMessage } from "../../_lib/useErrMessage";

export default function AutoJoinPage() {
  const t = useT();
  const router = useRouter();
  const errMessage = useErrMessage();
  const { id } = useParams<{ id: string }>();
  const { isAuthenticated, ready } = useAuth();
  const join = useJoinCampaign();
  const started = useRef(false);

  useEffect(() => {
    if (!ready || started.current) return;
    if (!isAuthenticated) {
      router.replace(`/login?return=${encodeURIComponent(`/c/${id}`)}`);
      return;
    }
    started.current = true;
    join.mutate(id, {
      onSuccess: () => router.replace(`/campaigns/${id}`),
    });
    // join is stable from react-query; id/auth gate the effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, isAuthenticated, id, router]);

  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
      {join.isError ? (
        <>
          <p className="text-sm font-semibold text-danger">{errMessage(join.error)}</p>
          <button
            onClick={() => {
              started.current = false;
              join.reset();
              join.mutate(id, { onSuccess: () => router.replace(`/campaigns/${id}`) });
            }}
            className="rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-brand-fg shadow-glow"
          >
            {t("cmp.join.retry")}
          </button>
        </>
      ) : (
        <>
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-brand" aria-hidden />
          <p className="text-sm font-semibold text-subtle">{t("cmp.join.joining")}</p>
        </>
      )}
    </main>
  );
}
