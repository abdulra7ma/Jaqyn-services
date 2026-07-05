"use client";

// Owner account activation from the invite email link (/business/activate?token=…).
// Validates the token, sets a password, stores the JWTs, and continues into onboarding.

import { ApiClientError, businessApi, tokenStore, useActivateInvite, type InviteValidation } from "@jaqyn/api";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

// Owner-invite tokens are minted by backend/apps/businesses/onboarding_services.py:31:
//   secrets.token_urlsafe(32) → 43 base64url chars [A-Za-z0-9_-]
// Validate shape before the validateInvite API call so malformed values are
// rejected client-side without a network round-trip.
const INVITE_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

function isValidInviteToken(raw: string): boolean {
  return INVITE_TOKEN_RE.test(raw);
}

const FIELD =
  "w-full rounded-xl border-[1.5px] border-line bg-card px-3 py-3 text-sm font-semibold text-ink outline-none transition focus:border-brand";
const LABEL = "text-xs font-bold text-subtle";

function ActivateInner() {
  const params = useSearchParams();
  const router = useRouter();
  // Capture the token ONCE at mount. M11 strips it from the URL after validation;
  // reading it live would then re-run the effect with an empty token and wrongly
  // show "no token in link". Captured-in-state keeps validation stable.
  const [token] = useState(() => params.get("token") ?? "");
  const activate = useActivateInvite();

  const [invite, setInvite] = useState<InviteValidation | null>(null);
  const [invalid, setInvalid] = useState<string | null>(null);
  // M5: track in-flight validation so we don't flash a blank-email form
  const [validating, setValidating] = useState(true);
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!token) {
      setInvalid("No activation token in the link.");
      setValidating(false);
      return;
    }
    // Reject malformed tokens before any network call (defense-in-depth:
    // backend validates too, but we avoid a round-trip and log noise).
    if (!isValidInviteToken(token)) {
      setInvalid("GENERIC:This invitation link is invalid or expired.");
      setValidating(false);
      return;
    }
    businessApi
      .validateInvite(token)
      .then((d) => {
        if (!active) return;
        setInvite(d);
        // M11: token is captured in state; strip it from the URL so it isn't
        // leaked in Referer headers or browser history.
        router.replace("/business/activate", { scroll: false });
      })
      .catch((e: unknown) => {
        if (!active) return;
        // L1: distinguish invite error codes for actionable messages
        if (e instanceof ApiClientError) {
          if (e.code === "INVITE_USED") {
            setInvalid(
              "USED:This invite was already used — please log in instead.",
            );
          } else if (e.code === "INVITE_EXPIRED") {
            setInvalid("EXPIRED:This invite has expired — ask the Jaqyn team to resend.");
          } else {
            setInvalid(
              "GENERIC:" +
                (e.message ?? "This invitation link is invalid or expired."),
            );
          }
        } else {
          setInvalid(
            "GENERIC:" +
              ((e as { message?: string })?.message ??
                "This invitation link is invalid or expired."),
          );
        }
      })
      .finally(() => {
        if (active) setValidating(false);
      });
    return () => {
      active = false;
    };
  }, [token, router]);

  function submit() {
    setError(null);
    if (!fullName.trim()) return setError("Enter your full name");
    if (password.length < 6) return setError("Password needs 6+ characters");
    if (password !== confirm) return setError("Passwords do not match");
    if (!agree) return setError("Please accept the terms");
    activate.mutate(
      { token, full_name: fullName.trim(), password },
      {
        onSuccess: (res) => {
          tokenStore.set(res.access, res.refresh);
          router.replace("/business/onboarding");
        },
        onError: (e: unknown) => setError((e as { message?: string })?.message ?? "Activation failed"),
      },
    );
  }

  // M5: show loading skeleton while validating and we don't yet know it's invalid
  if (validating && !invalid) {
    return (
      <Shell>
        <div className="rounded-[20px] border border-line bg-card p-6 shadow-card animate-pulse">
          <div className="h-5 w-1/2 rounded bg-line" />
          <div className="mt-4 h-10 w-full rounded-xl bg-line" />
          <div className="mt-3.5 h-10 w-full rounded-xl bg-line" />
          <div className="mt-5 h-[50px] w-full rounded-[14px] bg-line" />
        </div>
      </Shell>
    );
  }

  if (invalid) {
    // L1: parse the prefixed code written by the catch block above
    const colonIdx = invalid.indexOf(":");
    const code = colonIdx !== -1 ? invalid.slice(0, colonIdx) : "GENERIC";
    const msg = colonIdx !== -1 ? invalid.slice(colonIdx + 1) : invalid;

    return (
      <Shell>
        <div className="rounded-[20px] border border-line bg-card p-6 text-center shadow-card">
          <div className="text-3xl">⏳</div>
          <div className="mt-3 font-display text-lg font-bold text-ink">Activation link unavailable</div>
          <p className="mt-2 text-sm text-subtle">{msg}</p>
          {code === "USED" && (
            <p className="mt-3 text-[12.5px] text-subtle">
              <a href="/business" className="font-semibold text-brand underline">Go to business login</a>
            </p>
          )}
          {code !== "USED" && (
            <p className="mt-4 text-[12.5px] text-subtle">
              Ask the Jaqyn team to resend your invite, or contact <b className="text-ink">hello@jaqyn.kg</b>.
            </p>
          )}
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="flex items-center gap-3">
        <div className="flex h-[46px] w-[46px] items-center justify-center rounded-[14px] bg-brand-gradient font-display text-[23px] font-extrabold text-brand-fg shadow-glow">
          J
        </div>
        <div>
          <div className="font-display text-[22px] font-bold text-ink">Activate your account</div>
          <div className="mt-0.5 text-[13.5px] text-subtle">Set a password to finish creating your owner account.</div>
        </div>
      </div>

      {/* H10: wrap inputs + submit in a real <form> so Enter key and assistive
          technology treat this as a form, and submit is triggered by type="submit". */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="mt-6 rounded-[20px] border border-line bg-card p-6 shadow-card">
          <label className="block">
            <span className={LABEL}>Email</span>
            <input value={invite?.email ?? ""} readOnly className={`${FIELD} mt-1.5 bg-[#F6F0E6]`} />
          </label>
          <label className="mt-3.5 block">
            <span className={LABEL}>Full name</span>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Nurlan Aliev"
              className={`${FIELD} mt-1.5`}
            />
          </label>
          <div className="mt-3.5 flex gap-3">
            <label className="flex-1">
              <span className={LABEL}>Password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="6+ characters"
                className={`${FIELD} mt-1.5`}
              />
            </label>
            <label className="flex-1">
              <span className={LABEL}>Confirm</span>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Repeat"
                className={`${FIELD} mt-1.5`}
              />
            </label>
          </div>
          {/* B3: real checkbox for the terms agreement. The visible styled tick
              span is kept but marked aria-hidden; the native checkbox is sr-only
              so it is accessible to keyboard and screen readers. */}
          <label className="mt-[18px] flex w-full cursor-pointer items-start gap-2.5 text-left">
            <input
              type="checkbox"
              checked={agree}
              onChange={(e) => setAgree(e.target.checked)}
              className="sr-only"
            />
            <span
              aria-hidden="true"
              className={`flex h-5 w-5 flex-none items-center justify-center rounded-[6px] border-[1.5px] text-xs font-bold text-brand-fg ${
                agree ? "border-brand bg-brand" : "border-line bg-card"
              }`}
            >
              {agree ? "✓" : ""}
            </span>
            <span className="text-[12.5px] leading-snug text-subtle">
              I agree to the Jaqyn <b className="text-ink">Terms of Service</b> and <b className="text-ink">Privacy Policy</b>.
            </span>
          </label>
          {error && <p className="mt-3 text-[13px] font-semibold text-danger">{error}</p>}
          <button
            type="submit"
            disabled={activate.isPending || !invite}
            className="mt-5 w-full rounded-[14px] bg-brand py-[15px] text-[15px] font-bold text-brand-fg shadow-glow transition hover:brightness-105 disabled:opacity-60"
          >
            {activate.isPending ? "Activating…" : "Activate & start setup"}
          </button>
        </div>
      </form>

      <div className="mt-4 flex items-center justify-between text-[12.5px] text-subtle">
        <span>{invite ? "Invitation valid" : "Validating invitation…"}</span>
        <span>
          Questions? <b className="text-ink">hello@jaqyn.kg</b>
        </span>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-cream px-4 py-10 font-sans text-ink sm:px-6">
      <div className="w-full max-w-[440px] animate-[jqIn_.3s_ease]">{children}</div>
    </div>
  );
}

export default function BusinessActivatePage() {
  return (
    <Suspense fallback={<Shell>{null}</Shell>}>
      <ActivateInner />
    </Suspense>
  );
}
