"use client";

import { useQrResolve, type QrResolve } from "@jaqyn/api";
import { LanguageSwitch, useT } from "@jaqyn/i18n";
import { Button, Loading, ErrorState, cn } from "@jaqyn/ui";
import { useReducedMotion } from "framer-motion";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useErrMessage } from "../../_lib/useErrMessage";
import { useAuth } from "../../_lib/auth";

// QR tokens are minted by backend/core/qr.py::generate_token():
//   secrets.token_urlsafe(24) → 32 base64url chars [A-Za-z0-9_-]
// Validate before any network call so a malformed value is rejected client-side.
const QR_TOKEN_RE = /^[A-Za-z0-9_-]{32}$/;

function isValidQrToken(raw: unknown): raw is string {
  return typeof raw === "string" && QR_TOKEN_RE.test(raw);
}

export default function QrLandingPage() {
  const t = useT();
  const errMessage = useErrMessage();
  const params = useParams<{ token: string }>();
  const rawToken = params?.token;
  const { isAuthenticated, ready } = useAuth();
  // Design-system §Animations: idle-bob tokens are gated behind reduced-motion.
  const reduceMotion = useReducedMotion();

  // Pass empty string when token shape is invalid — useQrResolve's `enabled: !!token`
  // guard prevents any network request for invalid/missing tokens.
  const token = isValidQrToken(rawToken) ? rawToken : "";
  const resolve = useQrResolve(token);
  const loginHref = `/login?return=${encodeURIComponent(`/q/${token}`)}`;

  return (
    <div className="relative mx-auto min-h-screen max-w-md bg-cream px-5 pb-10 pt-4">
      {/* Jaqyn brand mark, top-left — mirrors the login logomark so first-scan
          visitors can see whose platform they've landed on. */}
      <div
        className="absolute left-4 top-4 flex h-9 w-9 items-center justify-center rounded-[13px] bg-brand-gradient font-display text-lg font-extrabold text-brand-fg shadow-glow"
        aria-label="Jaqyn"
      >
        J
      </div>
      <div className="absolute right-4 top-4">
        <LanguageSwitch />
      </div>

      {resolve.isLoading && <Loading label={t("common.loading")} />}
      {(!token || resolve.isError) && (
        <ErrorState
          message={!token ? t("common.error") : errMessage(resolve.error)}
          onRetry={!token ? undefined : () => resolve.refetch()}
          retryLabel={t("common.retry")}
        />
      )}

      {resolve.data && (
        <div className="flex flex-col items-center pt-6">
          <Badge
            label={`${t("qr.scanned")} · ${resolve.data.business?.name ?? ""}`}
            pulse={!reduceMotion}
          />

          <Avatar
            name={resolve.data.business?.name ?? "?"}
            logoUrl={resolve.data.business?.logo_url ?? null}
            float={!reduceMotion}
          />

          <h1 className="mt-5 text-center text-[26px] font-bold leading-tight tracking-tight text-ink">
            {t("qr.collectStampsAt")}
            <br />
            {resolve.data.business?.name}
          </h1>
          <p className="mt-3 max-w-[260px] text-center text-[14.5px] text-subtle">
            {t("qr.onboardSubtitle")}
          </p>

          {resolve.data.reward_program && (
            <RewardCard qr={resolve.data} float={!reduceMotion} />
          )}

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

function Badge({ label, pulse }: { label: string; pulse: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-pill border border-line bg-card px-3 py-1.5 text-xs font-semibold text-subtle shadow-card">
      {/* live "just scanned" dot — pulses like the landing site's status dots */}
      <span
        className={cn("h-[7px] w-[7px] rounded-full bg-sage-deep", pulse && "animate-jq-dot")}
      />
      {label}
    </span>
  );
}

function Avatar({
  name,
  logoUrl,
  float,
}: {
  name: string;
  logoUrl: string | null;
  float: boolean;
}) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <div className={cn("relative mt-9", float && "animate-jq-float")}>
      {/* soft halo behind the icon so it reads as lifted off the cream page */}
      <span
        aria-hidden
        className="pointer-events-none absolute -inset-3 rounded-[34px] bg-brand/20 blur-xl"
      />
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- small avatar, remote logo, no layout shift risk
        <img
          src={logoUrl}
          alt=""
          className="relative h-[84px] w-[84px] rounded-[26px] object-cover shadow-glow ring-1 ring-line"
        />
      ) : (
        <div className="relative flex h-[84px] w-[84px] items-center justify-center rounded-[26px] bg-brand-gradient font-display text-[38px] font-extrabold text-brand-fg shadow-glow">
          {initial}
        </div>
      )}
    </div>
  );
}

/**
 * First-scan reward, shown as a floating wallet-style card face (design-system
 * §8 "Featured card"): accent gradient, translucent watermark bleed, oversized
 * faded initial, loyalty-type pill, and — for stamp/visit programs — the empty
 * progress row the customer will fill. Mirrors the physical cards in the loyalty
 * wallet so the reward reads as something they'll collect, not a flat notice.
 */
function RewardCard({ qr, float }: { qr: QrResolve; float: boolean }) {
  const t = useT();
  const prog = qr.reward_program!;
  const n = prog.required_count ?? 0;
  const initial = (qr.business?.name ?? "?").trim().charAt(0).toUpperCase() || "?";
  return (
    <div
      className={cn(
        "relative mt-7 w-full overflow-hidden rounded-modal bg-brand-gradient p-5 text-white shadow-card-float ring-1 ring-white/25",
        float && "animate-jq-card-float",
      )}
    >
      {/* decorative translucent watermark circle bleed (§8) */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-12 h-48 w-48 rounded-full bg-white/10"
      />
      {/* oversized faded initial — echoes the wallet card face */}
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-8 right-2 select-none font-display text-[128px] font-extrabold leading-none text-white/10"
      >
        {initial}
      </span>
      {/* glossy sheen + top edge highlight — the laminated-card look: the face
          catches light from the top-left and its top rim glints, so it reads as a
          real, physical object rather than a flat panel. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/30 via-white/5 to-transparent"
      />
      <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/40" />

      <div className="relative flex items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-wider text-white/70">
          {t("qr.yourReward")}
        </p>
        <span className="inline-flex items-center rounded-pill bg-white/20 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
          {t(`qr.loyalty.${prog.type}`)}
        </span>
      </div>
      <p className="relative mb-4 mt-2 font-display text-[19px] font-bold leading-snug drop-shadow-sm">
        {prog.reward_description || prog.title}
      </p>
      {n > 0 && (
        <div className="relative flex justify-between gap-2.5">
          {Array.from({ length: n }).map((_, i) =>
            i === n - 1 ? (
              <span
                key={i}
                className="flex aspect-square flex-1 items-center justify-center rounded-full bg-white text-base font-bold text-brand shadow-sm"
              >
                ★
              </span>
            ) : (
              <span
                key={i}
                className="flex aspect-square flex-1 items-center justify-center rounded-full border-2 border-dashed border-white/40 text-[11px] font-bold text-white/70"
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
