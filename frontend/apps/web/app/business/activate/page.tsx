"use client";

// Owner account activation from the invite email link (/business/activate?token=…).
// Validates the token, sets a password, stores the JWTs, and continues into onboarding.

import { businessApi, tokenStore, useActivateInvite, type InviteValidation } from "@jaqyn/api";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

const FIELD =
  "w-full rounded-xl border-[1.5px] border-line bg-card px-3 py-3 text-sm font-semibold text-ink outline-none transition focus:border-brand";
const LABEL = "text-xs font-bold text-subtle";

function ActivateInner() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") ?? "";
  const activate = useActivateInvite();

  const [invite, setInvite] = useState<InviteValidation | null>(null);
  const [invalid, setInvalid] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!token) {
      setInvalid("No activation token in the link.");
      return;
    }
    businessApi
      .validateInvite(token)
      .then((d) => active && setInvite(d))
      .catch((e) => active && setInvalid(e?.message ?? "This invitation link is invalid or expired."));
    return () => {
      active = false;
    };
  }, [token]);

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

  if (invalid) {
    return (
      <Shell>
        <div className="rounded-[20px] border border-line bg-card p-6 text-center shadow-card">
          <div className="text-3xl">⏳</div>
          <div className="mt-3 font-display text-lg font-bold text-ink">Activation link unavailable</div>
          <p className="mt-2 text-sm text-subtle">{invalid}</p>
          <p className="mt-4 text-[12.5px] text-subtle">
            Ask the Jaqyn team to resend your invite, or contact <b className="text-ink">hello@jaqyn.kg</b>.
          </p>
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
        <button onClick={() => setAgree(!agree)} className="mt-[18px] flex w-full items-start gap-2.5 text-left">
          <span
            className={`flex h-5 w-5 flex-none items-center justify-center rounded-[6px] border-[1.5px] text-xs font-bold text-brand-fg ${
              agree ? "border-brand bg-brand" : "border-line bg-card"
            }`}
          >
            {agree ? "✓" : ""}
          </span>
          <span className="text-[12.5px] leading-snug text-subtle">
            I agree to the Jaqyn <b className="text-ink">Terms of Service</b> and <b className="text-ink">Privacy Policy</b>.
          </span>
        </button>
        {error && <p className="mt-3 text-[13px] font-semibold text-danger">{error}</p>}
        <button
          onClick={submit}
          disabled={activate.isPending || !invite}
          className="mt-5 w-full rounded-[14px] bg-brand py-[15px] text-[15px] font-bold text-brand-fg shadow-glow transition hover:brightness-105 disabled:opacity-60"
        >
          {activate.isPending ? "Activating…" : "Activate & start setup"}
        </button>
      </div>

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
