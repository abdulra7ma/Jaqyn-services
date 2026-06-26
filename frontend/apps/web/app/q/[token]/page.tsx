"use client";

import { useQrResolve, type QrResolve } from "@jaqyn/api";
import { LanguageSwitch, useT } from "@jaqyn/i18n";
import { Button, Loading, ErrorState } from "@jaqyn/ui";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useErrMessage } from "../../_lib/useErrMessage";
import { useAuth } from "../../_lib/auth";

export default function QrLandingPage() {
  const t = useT();
  const errMessage = useErrMessage();
  const { token } = useParams<{ token: string }>();
  const { isAuthenticated, ready } = useAuth();

  const resolve = useQrResolve(token);
  const loginHref = `/login?return=${encodeURIComponent(`/q/${token}`)}`;

  return (
    <div className="relative mx-auto min-h-screen max-w-md bg-cream px-5 pb-10 pt-4">
      <div className="absolute right-4 top-4">
        <LanguageSwitch />
      </div>

      {resolve.isLoading && <Loading label={t("common.loading")} />}
      {resolve.isError && (
        <ErrorState
          message={errMessage(resolve.error)}
          onRetry={() => resolve.refetch()}
          retryLabel={t("common.retry")}
        />
      )}

      {resolve.data && (
        <div className="flex flex-col items-center pt-6">
          <Badge label={`${t("qr.scanned")} · ${resolve.data.business?.name ?? ""}`} />

          <Avatar name={resolve.data.business?.name ?? "?"} />

          <h1 className="mt-5 text-center text-[26px] font-bold leading-tight tracking-tight text-ink">
            {t("qr.collectStampsAt")}
            <br />
            {resolve.data.business?.name}
          </h1>
          <p className="mt-3 max-w-[260px] text-center text-[14.5px] text-subtle">
            {t("qr.onboardSubtitle")}
          </p>

          {resolve.data.reward_program && <RewardCard qr={resolve.data} />}

          {/* ---- action zone ---- */}
          {/* Stamps are now collected by staff scanning the customer's QR (the
              approval-code self-collect flow was removed in the campaigns
              restructure). First-scan visitors get a join/login CTA; signed-in
              customers go to their personal QR to be scanned. */}
          {!ready ? null : !isAuthenticated ? (
            <div className="mt-6 flex w-full flex-col gap-3">
              <Link href={loginHref}>
                <Button className="w-full">{t("qr.joinCollect")}</Button>
              </Link>
              <Link href={loginHref}>
                <Button variant="secondary" className="w-full border border-line bg-card text-brand">
                  {t("qr.haveAccount")}
                </Button>
              </Link>
            </div>
          ) : (
            <div className="mt-6 flex w-full flex-col gap-3">
              <Link href="/qr">
                <Button className="w-full">{t("home.myQr")}</Button>
              </Link>
              <Link href="/campaigns">
                <Button variant="secondary" className="w-full border border-line bg-card text-brand">
                  {t("nav.campaigns")}
                </Button>
              </Link>
            </div>
          )}

          <p className="mt-8 text-xs text-subtle">{t("qr.poweredBy")}</p>
        </div>
      )}
    </div>
  );
}

function Badge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-pill border border-line bg-card px-3 py-1.5 text-xs font-semibold text-subtle">
      <span className="h-[7px] w-[7px] rounded-full bg-sage-deep" />
      {label}
    </span>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <div className="mt-9 flex h-[84px] w-[84px] items-center justify-center rounded-[26px] bg-brand-gradient font-display text-[38px] font-extrabold text-brand-fg shadow-glow">
      {name.trim().charAt(0).toUpperCase() || "?"}
    </div>
  );
}

function RewardCard({ qr }: { qr: QrResolve }) {
  const t = useT();
  const prog = qr.reward_program!;
  const n = prog.required_count ?? 0;
  return (
    <div className="mt-6 w-full rounded-2xl border border-line bg-card p-5 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-wider text-subtle">{t("qr.yourReward")}</p>
        <span className="inline-flex items-center rounded-pill border border-line bg-cream px-2.5 py-1 text-[11px] font-semibold text-brand">
          {t(`qr.loyalty.${prog.type}`)}
        </span>
      </div>
      <p className="mb-3.5 mt-2 font-display text-[17px] font-bold text-ink">
        {prog.reward_description || prog.title}
      </p>
      {n > 0 && (
        <div className="flex justify-between gap-2.5">
          {Array.from({ length: n }).map((_, i) =>
            i === n - 1 ? (
              <span
                key={i}
                className="flex aspect-square flex-1 items-center justify-center rounded-full bg-amber text-base font-bold text-white"
              >
                ★
              </span>
            ) : (
              <span
                key={i}
                className="flex aspect-square flex-1 items-center justify-center rounded-full border-2 border-dashed border-[#DCC9AE] text-[11px] font-bold text-[#C7B193]"
              >
                {i + 1}
              </span>
            ),
          )}
        </div>
      )}
    </div>
  );
}
