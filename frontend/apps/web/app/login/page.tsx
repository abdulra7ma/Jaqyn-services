"use client";

import type { Area, AuthResult } from "@jaqyn/api";
import { usePasswordLogin, useRequestOtp, useVerifyOtp } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { Button, Input } from "@jaqyn/ui";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ConsentNote } from "../_components/ConsentNote";
import { useErrMessage } from "../_lib/useErrMessage";

/** Where a user lands after login — owner/staff to their console, else the return URL. */
function areaPath(area: Area, returnTo: string) {
  if (area === "business") return "/business/dashboard";
  if (area === "staff") return "/staff";
  return returnTo || "/";
}

function LoginFlow() {
  const t = useT();
  const errMessage = useErrMessage();
  const router = useRouter();
  const params = useSearchParams();
  const returnTo = params.get("return") || "/";

  const [mode, setMode] = useState<"phone" | "email">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const requestOtp = useRequestOtp();
  const verifyOtp = useVerifyOtp();
  const passwordLogin = usePasswordLogin();

  // New customers (or any who never finished the tour) land on the product tour first.
  const go = (r: AuthResult) => {
    if (r.area === "customer" && (r.is_new || r.onboarding_completed === false)) {
      router.replace(`/onboarding?return=${encodeURIComponent(returnTo)}`);
      return;
    }
    router.replace(areaPath(r.area, returnTo));
  };
  const swap = mode === "email" ? "animate-[jqSwapR_.3s_ease]" : "animate-[jqSwapL_.3s_ease]";

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
        aria-label="Back home"
      >
        ←
      </Link>

      <div className="relative z-10 w-full max-w-[420px] animate-[jqIn_.4s_ease]">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-[18px] bg-brand-gradient font-display text-3xl font-extrabold text-brand-fg shadow-glow">
            J
          </div>
          <h1 className="mt-4 font-display text-2xl font-bold text-ink sm:text-[27px]">Welcome to Jaqyn</h1>
          <p className="mt-1.5 text-sm text-subtle">{t("auth.unified.subtitle")}</p>
        </div>

        <div className="mt-6 rounded-[22px] border border-line bg-card/80 p-5 shadow-card backdrop-blur-sm sm:p-6">
          {/* sliding tab toggle */}
          <div className="relative flex rounded-xl bg-board/60 p-1">
            <div
              className="absolute bottom-1 left-1 top-1 w-[calc(50%-4px)] rounded-[10px] bg-card shadow-card transition-transform duration-300 ease-out"
              style={{ transform: mode === "email" ? "translateX(100%)" : "translateX(0)" }}
            />
            {(["phone", "email"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`relative z-10 flex-1 rounded-[10px] py-2 text-center text-sm font-semibold transition-colors ${
                  mode === m ? "text-ink" : "text-subtle"
                }`}
              >
                {t(`auth.tab.${m}`)}
              </button>
            ))}
          </div>

          {/* animated form swap */}
          <div key={`${mode}-${step}`} className={`mt-5 ${swap}`}>
            {mode === "phone" ? (
              step === "phone" ? (
                <form
                  className="flex flex-col gap-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    requestOtp.mutate(phone, { onSuccess: () => setStep("code") });
                  }}
                >
                  <Input
                    label={t("auth.phone")}
                    type="tel"
                    inputMode="tel"
                    placeholder={t("auth.phonePlaceholder")}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                  />
                  {requestOtp.isError && <p className="text-sm text-danger">{errMessage(requestOtp.error)}</p>}
                  <Button type="submit" disabled={requestOtp.isPending || phone.length < 9}>
                    {requestOtp.isPending ? t("common.loading") : t("auth.sendCode")}
                  </Button>
                </form>
              ) : (
                <form
                  className="flex flex-col gap-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    verifyOtp.mutate({ phone, code }, { onSuccess: (r) => go(r) });
                  }}
                >
                  <p className="text-sm text-subtle">
                    {t("auth.codeSentTo")} <b className="text-ink">{phone}</b>
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
                  {verifyOtp.isError && <p className="text-sm text-danger">{errMessage(verifyOtp.error)}</p>}
                  <Button type="submit" disabled={verifyOtp.isPending || code.length < 4}>
                    {verifyOtp.isPending ? t("common.loading") : t("auth.verify")}
                  </Button>
                  <button type="button" className="text-sm font-semibold text-brand" onClick={() => setStep("phone")}>
                    ‹ {t("auth.resend")}
                  </button>
                </form>
              )
            ) : (
              <form
                className="flex flex-col gap-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  passwordLogin.mutate({ email, password }, { onSuccess: (r) => go(r) });
                }}
              >
                <Input
                  label={t("auth.email")}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder={t("auth.emailPlaceholder")}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
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
                <Button type="submit" disabled={passwordLogin.isPending || !email || !password}>
                  {passwordLogin.isPending ? t("common.loading") : t("auth.signIn")}
                </Button>
              </form>
            )}
          </div>

          {/* social auth — coming soon */}
          <div className="mt-6 flex items-center gap-3">
            <span className="h-px flex-1 bg-line" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-subtle">or</span>
            <span className="h-px flex-1 bg-line" />
          </div>
          <div className="mt-4 flex flex-col gap-2.5">
            {[
              { key: "google", label: "Continue with Google", glyph: "G" },
              { key: "apple", label: "Continue with Apple", glyph: "" },
            ].map((p) => (
              <button
                key={p.key}
                type="button"
                disabled
                title="Social sign-in is coming soon"
                className="flex cursor-not-allowed items-center justify-center gap-2.5 rounded-xl border border-line bg-card/60 py-3 text-sm font-semibold text-subtle"
              >
                <span className="font-display text-[15px]">{p.glyph}</span>
                {p.label}
                <span className="ml-1 rounded-full bg-board/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em] text-subtle">
                  Soon
                </span>
              </button>
            ))}
          </div>
        </div>

        <p className="mt-5 text-center text-[12.5px] text-subtle">Google &amp; other social sign-in are coming soon.</p>
        <p className="mt-2 text-center text-[12.5px] text-subtle">
          {t("auth.noAccount")}{" "}
          <Link href="/signup" className="font-semibold text-brand hover:underline">
            {t("auth.signup")}
          </Link>
        </p>
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
