"use client";

import type { AuthResult } from "@jaqyn/api";
import {
  postAuthRoute,
  useGoogleAuth,
  useLoginResolve,
  usePasswordLogin,
  useRequestEmailOtp,
  useRequestOtp,
  useVerifyEmailOtp,
  useVerifyOtp,
} from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { Button, Input } from "@jaqyn/ui";
import { GoogleLogin } from "@react-oauth/google";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { ConsentNote } from "../_components/ConsentNote";
import { useErrMessage } from "../_lib/useErrMessage";

function LoginFlow() {
  const t = useT();
  const errMessage = useErrMessage();
  const router = useRouter();
  const params = useSearchParams();
  const returnTo = params.get("return") || "/";

  const [step, setStep] = useState<"identifier" | "code" | "password">("identifier");
  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");

  const isEmail = identifier.includes("@");

  const resolve = useLoginResolve();
  const requestOtp = useRequestOtp();
  const verifyOtp = useVerifyOtp();
  const requestEmailOtp = useRequestEmailOtp();
  const verifyEmailOtp = useVerifyEmailOtp();
  const passwordLogin = usePasswordLogin();
  const googleAuth = useGoogleAuth();

  // GoogleLogin's `width` takes a fixed px number, not "100%" — measure the
  // card so the button spans edge-to-edge like every other button here.
  const googleWrapRef = useRef<HTMLDivElement>(null);
  const [googleWidth, setGoogleWidth] = useState(320);
  useEffect(() => {
    const el = googleWrapRef.current;
    if (!el) return;
    const measure = () => setGoogleWidth(Math.round(el.offsetWidth));
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const go = (r: AuthResult) => router.replace(postAuthRoute(r, returnTo));

  function onContinue() {
    resolve.mutate(identifier, {
      onSuccess: (r) => setStep(r.method === "password" ? "password" : "code"),
    });
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-cream px-4 py-10 font-sans text-ink sm:px-6">
      {/* drifting background blobs */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute -left-24 -top-24 h-[42vw] max-h-[420px] min-h-[260px] w-[42vw] min-w-[260px] max-w-[420px] rounded-full bg-brand/25 blur-3xl"
          style={{ animation: "jqFloatA 14s ease-in-out infinite" }}
        />
        <div
          className="absolute -right-20 top-1/3 h-[36vw] max-h-[360px] min-h-[220px] w-[36vw] min-w-[220px] max-w-[360px] rounded-full bg-sage/20 blur-3xl"
          style={{ animation: "jqFloatB 18s ease-in-out infinite" }}
        />
        <div
          className="absolute -bottom-24 left-1/4 h-[34vw] max-h-[340px] min-h-[200px] w-[34vw] min-w-[200px] max-w-[340px] rounded-full bg-amber/20 blur-3xl"
          style={{ animation: "jqFloatC 16s ease-in-out infinite" }}
        />
      </div>

      <Link
        href="/"
        className="absolute left-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-line bg-card/70 text-subtle backdrop-blur transition hover:text-brand sm:left-6 sm:top-6"
        aria-label={t("auth.backHome")}
      >
        ←
      </Link>

      <div className="relative z-10 w-full max-w-[420px] animate-[jqIn_.4s_ease]">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-[18px] bg-brand-gradient font-display text-3xl font-extrabold text-brand-fg shadow-glow">
            J
          </div>
          <h1 className="mt-4 font-display text-2xl font-bold text-ink sm:text-[27px]">{t("home.guestTitle")}</h1>
          <p className="mt-1.5 text-sm text-subtle">{t("auth.unified.subtitle")}</p>
        </div>

        <div className="mt-6 rounded-[22px] border border-line bg-card/80 p-5 shadow-card backdrop-blur-sm sm:p-6">
          <div key={step} className="animate-[jqIn_.3s_ease]">
            {step === "identifier" && (
              <form
                className="flex flex-col gap-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  onContinue();
                }}
              >
                <Input
                  label={t("auth.identifier")}
                  type="text"
                  inputMode="email"
                  autoComplete="username"
                  placeholder={t("auth.identifierPlaceholder")}
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  required
                />
                {resolve.isError && <p className="text-sm text-danger">{errMessage(resolve.error)}</p>}
                <Button type="submit" disabled={resolve.isPending || identifier.length < 4}>
                  {resolve.isPending ? t("common.loading") : t("auth.continue")}
                </Button>
              </form>
            )}

            {step === "code" && (
              <form
                className="flex flex-col gap-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (isEmail) {
                    verifyEmailOtp.mutate({ email: identifier, code }, { onSuccess: (r) => go(r) });
                  } else {
                    verifyOtp.mutate({ phone: identifier, code }, { onSuccess: (r) => go(r) });
                  }
                }}
              >
                <p className="text-sm text-subtle">
                  {t("auth.codeSentTo")} <b className="text-ink">{identifier}</b>
                </p>
                <Input
                  label={t("auth.enterCode")}
                  type="tel"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="0000"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                />
                {(isEmail ? verifyEmailOtp : verifyOtp).isError && (
                  <p className="text-sm text-danger">
                    {errMessage((isEmail ? verifyEmailOtp : verifyOtp).error)}
                  </p>
                )}
                <Button
                  type="submit"
                  disabled={(isEmail ? verifyEmailOtp : verifyOtp).isPending || code.length < 4}
                >
                  {(isEmail ? verifyEmailOtp : verifyOtp).isPending
                    ? t("common.loading")
                    : t("auth.verify")}
                </Button>
                <button
                  type="button"
                  className="text-sm font-semibold text-brand"
                  onClick={() =>
                    isEmail ? requestEmailOtp.mutate({ email: identifier }) : requestOtp.mutate(identifier)
                  }
                >
                  {t("auth.resend")}
                </button>
                <button type="button" className="text-sm text-subtle" onClick={() => setStep("identifier")}>
                  ‹ {t("common.back")}
                </button>
              </form>
            )}

            {step === "password" && (
              <form
                className="flex flex-col gap-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  passwordLogin.mutate({ identifier, password }, { onSuccess: (r) => go(r) });
                }}
              >
                <Input
                  label={t("auth.password")}
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <div className="-mt-1 flex justify-end">
                  <Link href="/forgot-password" className="text-xs font-semibold text-brand hover:underline">
                    {t("auth.forgotLink")}
                  </Link>
                </div>
                {passwordLogin.isError && <p className="text-sm text-danger">{errMessage(passwordLogin.error)}</p>}
                <Button type="submit" disabled={passwordLogin.isPending || !password}>
                  {passwordLogin.isPending ? t("common.loading") : t("auth.signIn")}
                </Button>
                <button type="button" className="text-sm text-subtle" onClick={() => setStep("identifier")}>
                  ‹ {t("common.back")}
                </button>
              </form>
            )}
          </div>

          {/* social auth */}
          <div className="mt-6 flex items-center gap-3">
            <span className="h-px flex-1 bg-line" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-subtle">{t("auth.or")}</span>
            <span className="h-px flex-1 bg-line" />
          </div>
          <div className="mt-4 flex flex-col items-center gap-2.5">
            {/* Google's iframe draws its own chrome (brand guidelines fix the
                colors) — shape/size/width are the only knobs we have, so we
                match those to the Apple button's rounded-xl/44px footprint and
                clip the corners to the same 14px radius. */}
            <div ref={googleWrapRef} className="w-full overflow-hidden rounded-xl">
              <GoogleLogin
                shape="rectangular"
                theme="outline"
                size="large"
                width={googleWidth}
                onSuccess={(cred) => {
                  if (!cred.credential) return;
                  googleAuth.mutate(cred.credential, { onSuccess: (r) => go(r) });
                }}
                useOneTap={false}
              />
            </div>
            {googleAuth.isError && <p className="text-sm text-danger">{errMessage(googleAuth.error)}</p>}
          </div>
        </div>

        <ConsentNote />
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginFlow />
    </Suspense>
  );
}
