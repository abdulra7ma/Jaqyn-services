"use client";

// Settings › Wallet card: pick the loyalty-card gradient the customer sees in
// their wallet, with a live preview. "Auto" hashes from the business id.

import { useBusinessMe, useUpdateBusiness } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { ACCENT_BG, resolveAccent } from "../../../loyalty/_lib/wallet";
import { SaveButton, SectionCard, useHydratedForm, type Notify } from "./parts";

// Wallet-card gradients: `value` is the backend `card_accent` name, `cls` the
// shared Tailwind preset gradient (bg-wallet-*). Keep in sync with
// loyalty/_lib/wallet.ts CARD_ACCENTS and packages/config/tailwind-preset.js.
const WALLET_ACCENTS = [
  { value: "terracotta", cls: "bg-wallet-terracotta" },
  { value: "amber", cls: "bg-wallet-amber" },
  { value: "sage", cls: "bg-wallet-sage" },
  { value: "plum", cls: "bg-wallet-plum" },
  { value: "indigo", cls: "bg-wallet-indigo" },
] as const;

export function WalletSection({ notify }: { notify: Notify }) {
  const t = useT();
  const me = useBusinessMe();
  const update = useUpdateBusiness();

  const logoUrl = me.data?.logo_url ?? null;
  const glyph = me.data?.glyph || "☕";
  const name = me.data?.name || t("owner.profile.yourBusiness");

  // "" = auto (backend falls back to a hash of the business id).
  const [cardAccent, setCardAccent] = useHydratedForm(me.data, () => me.data?.card_accent || "");

  function save() {
    update.mutate(
      { card_accent: cardAccent },
      {
        onSuccess: () => notify(t("owner.profile.saved")),
        onError: () => notify(t("owner.profile.saveFailed")),
      },
    );
  }

  const previewAccent = resolveAccent(me.data?.id ?? "preview", cardAccent);

  return (
    <SectionCard title={t("owner.profile.walletCard")} hint={t("owner.profile.walletCardHint")}>
      {/* live preview of the card face */}
      <div className="mt-3.5 flex justify-center">
        <div className={`relative flex aspect-[1.6/1] w-full max-w-[280px] flex-col justify-between overflow-hidden rounded-modal p-4 text-white shadow-glow ${ACCENT_BG[previewAccent]}`}>
          <span aria-hidden className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-white/10" />
          <div className="relative flex items-center gap-2.5">
            <div className="flex h-10 w-10 flex-none items-center justify-center overflow-hidden rounded-full bg-white/20 text-lg ring-1 ring-white/30">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                glyph
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate font-display text-[16px] font-bold leading-tight">{name}</p>
              <p className="truncate text-[12px] font-semibold text-white/85">{t("owner.profile.walletCardSample")}</p>
            </div>
          </div>
          <p className="relative font-display text-[26px] font-extrabold leading-none">
            120 <span className="font-sans text-[13px] font-bold text-white/80">{t("cmp.wallet.som")}</span>
          </p>
        </div>
      </div>

      {/* gradient chooser: Auto + five presets */}
      <div className="mt-3.5 flex flex-wrap gap-2.5">
        <button
          type="button"
          onClick={() => setCardAccent("")}
          className={`h-10 w-14 rounded-xl border-2 text-[11px] font-bold ${ACCENT_BG[resolveAccent(me.data?.id ?? "preview", "")]} text-white/90 ${cardAccent === "" ? "border-ink" : "border-white"}`}
          aria-label={t("owner.profile.walletCardAuto")}
          aria-pressed={cardAccent === ""}
        >
          {t("owner.profile.walletCardAuto")}
        </button>
        {WALLET_ACCENTS.map((a) => (
          <button
            key={a.value}
            type="button"
            onClick={() => setCardAccent(a.value)}
            className={`h-10 w-14 rounded-xl border-2 ${a.cls} ${cardAccent === a.value ? "border-ink" : "border-white"}`}
            aria-label={a.value}
            aria-pressed={cardAccent === a.value}
          />
        ))}
      </div>
      <SaveButton onClick={save} pending={update.isPending} />
    </SectionCard>
  );
}
