"use client";

import { useT } from "@jaqyn/i18n";
import { PRIVACY_URL, TERMS_URL } from "../_lib/legal";

/**
 * Passive consent notice for auth/signup surfaces: "By continuing, you agree to
 * our Privacy Policy and Terms." Consent-by-action is the standard pattern for
 * phone-OTP signup — no blocking checkbox, no friction for returning users.
 * Links open the landing-hosted legal pages in a new tab.
 */
export function ConsentNote({ className }: { className?: string }) {
  const t = useT();
  const linkCls = "font-semibold text-brand underline-offset-2 hover:underline";
  return (
    <p className={className ?? "mt-4 text-center text-[12.5px] leading-relaxed text-subtle"}>
      {t("auth.consent.pre")}
      <a href={PRIVACY_URL} target="_blank" rel="noreferrer" className={linkCls}>
        {t("auth.consent.privacy")}
      </a>
      {t("auth.consent.mid")}
      <a href={TERMS_URL} target="_blank" rel="noreferrer" className={linkCls}>
        {t("auth.consent.terms")}
      </a>
      {t("auth.consent.post")}
    </p>
  );
}
