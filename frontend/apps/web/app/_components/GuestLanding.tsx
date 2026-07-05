"use client";

// Marketing / discovery landing for signed-out visitors. Fully responsive
// (mobile → wide desktop), no bottom nav, with drifting background blobs, a
// scrolling partners strip, and staggered card reveals. Shows what you get,
// nearby places, and a Register-now CTA. Real nearby data via useNearby() with
// a friendly fallback so the showcase is never empty.

import { useNearby, type Business } from "@jaqyn/api";
import { LanguageSwitch, useT } from "@jaqyn/i18n";
import Link from "next/link";

const CAT_EMOJI: Record<string, string> = {
  cafe: "☕",
  restaurant: "🍽",
  barber: "💈",
  beauty: "💇",
  retail: "🛍",
  bakery: "🥐",
  other: "🏪",
};
const emoji = (c?: string) => CAT_EMOJI[c ?? "other"] ?? "🏪";

const FEATURES = [
  { glyph: "☕", titleKey: "guest.features.stamps.title", bodyKey: "guest.features.stamps.body" },
  { glyph: "👥", titleKey: "guest.features.groups.title", bodyKey: "guest.features.groups.body" },
  { glyph: "🎁", titleKey: "guest.features.rewards.title", bodyKey: "guest.features.rewards.body" },
  { glyph: "📍", titleKey: "guest.features.local.title", bodyKey: "guest.features.local.body" },
];

// FLOATING cards are demo reward previews. Business names ("Manas Coffee", "Salon & Spa")
// are proper nouns and not translated. Reward/tag strings go through i18n.
const FLOATING = [
  { glyph: "☕", titleKey: "guest.floating.stamp", tag: "Manas Coffee", tagIsKey: false, anim: "jqFloatA 7s ease-in-out infinite" },
  { glyph: "🎂", titleKey: "guest.floating.birthday", tag: "Salon & Spa", tagIsKey: false, anim: "jqFloatB 9s ease-in-out infinite" },
  { glyph: "👥", titleKey: "guest.floating.group", tag: "guest.floating.groupTag", tagIsKey: true, anim: "jqFloatC 8s ease-in-out infinite" },
];

const FALLBACK: Pick<Business, "id" | "name" | "category" | "area" | "reward">[] = [
  { id: "f1", name: "Manas Coffee", category: "cafe", area: "Chuy Avenue", reward: "Buy 5, get 1 free" },
  { id: "f2", name: "Lagman House", category: "restaurant", area: "Osh Bazaar", reward: "Free compote" },
  { id: "f3", name: "Sharp Barbers", category: "barber", area: "Jal", reward: "5th cut free" },
  { id: "f4", name: "Bloom Salon", category: "beauty", area: "Djal", reward: "Birthday treat" },
  { id: "f5", name: "Fresh Bakehouse", category: "bakery", area: "Center", reward: "Free pastry" },
  { id: "f6", name: "Linen & Co", category: "retail", area: "Vefa", reward: "10% off" },
];

export function GuestLanding() {
  const t = useT();
  const nearby = useNearby();
  const places = (nearby.data && nearby.data.length ? nearby.data : (FALLBACK as Business[])).slice(0, 6);
  const marquee = [...places, ...places, ...places].slice(0, 14);

  return (
    <div className="relative min-h-screen overflow-hidden bg-cream font-sans text-ink">
      {/* drifting blobs */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 -top-32 h-[44vw] max-h-[460px] min-h-[260px] w-[44vw] min-w-[260px] max-w-[460px] rounded-full bg-brand/20 blur-3xl" style={{ animation: "jqFloatA 16s ease-in-out infinite" }} />
        <div className="absolute right-[-10%] top-1/4 h-[40vw] max-h-[420px] min-h-[220px] w-[40vw] min-w-[220px] max-w-[420px] rounded-full bg-sage/15 blur-3xl" style={{ animation: "jqFloatB 20s ease-in-out infinite" }} />
        <div className="absolute bottom-[-15%] left-1/3 h-[38vw] max-h-[400px] min-h-[200px] w-[38vw] min-w-[200px] max-w-[400px] rounded-full bg-amber/15 blur-3xl" style={{ animation: "jqFloatC 18s ease-in-out infinite" }} />
      </div>

      {/* top bar */}
      <header className="sticky top-0 z-20 border-b border-line/60 bg-cream/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-brand-gradient font-display text-lg font-extrabold text-brand-fg shadow-glow">
              J
            </div>
            <span className="font-display text-lg font-bold text-ink">Jaqyn</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden sm:block">
              <LanguageSwitch />
            </div>
            <Link href="/login" className="rounded-pill px-3 py-2 text-[13.5px] font-semibold text-ink hover:text-brand sm:px-4">
              {t("guest.signIn")}
            </Link>
            <Link href="/login" className="rounded-pill bg-brand px-4 py-2 text-[13.5px] font-bold text-brand-fg shadow-glow transition hover:brightness-105 sm:px-5">
              {t("guest.registerNow")}
            </Link>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        {/* hero */}
        <section className="grid items-center gap-10 py-12 sm:py-16 lg:grid-cols-2 lg:gap-8 lg:py-24">
          <div className="animate-[jqIn_.4s_ease] text-center lg:text-left">
            <span className="inline-flex items-center gap-2 rounded-pill border border-line bg-card/70 px-3 py-1.5 text-[12px] font-semibold text-subtle backdrop-blur">
              <span className="h-2 w-2 rounded-full bg-sage-deep" /> {t("guest.hero.badge")}
            </span>
            <h1 className="mt-4 font-display text-4xl font-extrabold leading-[1.05] tracking-tight text-ink sm:text-5xl lg:text-6xl">
              {t("guest.hero.title")}
            </h1>
            <p className="mx-auto mt-4 max-w-md text-[15px] leading-relaxed text-subtle lg:mx-0 sm:text-base">
              {t("guest.hero.body")}
            </p>
            <div className="mt-7 flex flex-col items-center gap-3 sm:flex-row lg:items-start">
              <Link href="/login" className="w-full rounded-[14px] bg-brand px-7 py-3.5 text-center text-[15px] font-bold text-brand-fg shadow-glow transition hover:brightness-105 sm:w-auto">
                {t("guest.registerCta")}
              </Link>
              <Link href="/nearby" className="w-full rounded-[14px] border-[1.5px] border-line bg-card/70 px-7 py-3.5 text-center text-[15px] font-semibold text-ink backdrop-blur transition hover:border-brand sm:w-auto">
                {t("guest.exploreNearby")}
              </Link>
            </div>
            <p className="mt-4 text-[12.5px] text-subtle">{t("guest.joinHint")}</p>
          </div>

          {/* floating reward cards */}
          <div className="relative mx-auto h-[300px] w-full max-w-[420px] sm:h-[340px] lg:h-[400px]">
            {FLOATING.map((c, i) => (
              <div
                key={c.titleKey}
                className="absolute w-[230px] rounded-[18px] border border-line bg-card/90 p-4 shadow-card backdrop-blur sm:w-[260px]"
                style={{
                  top: `${[6, 38, 64][i]}%`,
                  left: `${[2, 34, 8][i]}%`,
                  animation: c.anim,
                  zIndex: 3 - i,
                }}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 flex-none items-center justify-center rounded-[12px] bg-brand-muted text-xl">{c.glyph}</div>
                  <div className="min-w-0">
                    <div className="truncate font-display text-[15px] font-bold text-ink">{t(c.titleKey)}</div>
                    <div className="text-[12px] text-subtle">{c.tagIsKey ? t(c.tag) : c.tag}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* what you get */}
        <section className="py-6 sm:py-10">
          <h2 className="text-center font-display text-2xl font-bold text-ink sm:text-3xl">{t("guest.features.title")}</h2>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f, i) => (
              <div
                key={f.titleKey}
                className="animate-[jqIn_.5s_ease_both] rounded-2xl border border-line bg-card/80 p-5 backdrop-blur-sm"
                style={{ animationDelay: `${i * 90}ms` }}
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-brand-muted text-2xl">{f.glyph}</div>
                <div className="mt-3.5 font-display text-base font-bold text-ink">{t(f.titleKey)}</div>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-subtle">{t(f.bodyKey)}</p>
              </div>
            ))}
          </div>
        </section>

        {/* partners marquee */}
        <section className="py-6 sm:py-10">
          <h2 className="text-center font-display text-2xl font-bold text-ink sm:text-3xl">{t("guest.partners.title")}</h2>
          <p className="mt-2 text-center text-[13.5px] text-subtle">{t("guest.partners.subtitle")}</p>
          <div className="relative mt-7 overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)]">
            <div className="jq-marquee flex w-max gap-3" style={{ animation: "jqMarquee 28s linear infinite" }}>
              {marquee.map((b, i) => (
                <span key={`${b.id}-${i}`} className="flex flex-none items-center gap-2.5 rounded-pill border border-line bg-card/80 px-4 py-2.5 text-[13.5px] font-semibold text-ink backdrop-blur">
                  <span className="text-base">{emoji(b.category)}</span>
                  {b.name}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* places near you */}
        <section className="py-6 sm:py-10">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">{t("guest.places.title")}</h2>
            <Link href="/nearby" className="text-[13.5px] font-semibold text-brand">{t("guest.places.seeAll")}</Link>
          </div>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {places.map((b, i) => (
              <Link
                key={b.id}
                href="/login"
                className="group animate-[jqIn_.5s_ease_both] overflow-hidden rounded-2xl border border-line bg-card/80 backdrop-blur-sm transition hover:border-brand hover:shadow-card"
                style={{ animationDelay: `${i * 70}ms` }}
              >
                {b.cover_url ? (
                  // CSS background instead of next/image: covers come from the API
                  // host at runtime (R2/media), same idiom as BusinessDetailsContent.
                  <div
                    className="h-24 bg-gradient-to-br from-brand/15 to-amber/15"
                    style={{ background: `url('${encodeURI(b.cover_url)}') center/cover` }}
                    role="img"
                    aria-label={b.name}
                  />
                ) : (
                  <div className="flex h-24 items-center justify-center bg-gradient-to-br from-brand/15 to-amber/15 text-4xl">{emoji(b.category)}</div>
                )}
                <div className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate font-display text-[15px] font-bold text-ink">{b.name}</div>
                    {typeof b.distance_km === "number" && (
                      <span className="flex-none text-[12px] font-semibold text-subtle">{b.distance_km.toFixed(1)} km</span>
                    )}
                  </div>
                  <div className="mt-0.5 text-[13px] capitalize text-subtle">
                    {b.category} · {b.area}
                  </div>
                  {b.reward && (
                    <span className="mt-3 inline-flex items-center gap-1.5 rounded-pill bg-sage-soft px-2.5 py-1 text-[11.5px] font-bold text-ok">
                      🎁 {b.reward}
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* final CTA */}
        <section className="py-8 sm:py-12">
          <div className="relative overflow-hidden rounded-[24px] bg-brand-gradient px-6 py-10 text-center text-brand-fg shadow-glow sm:px-10 sm:py-14">
            <div aria-hidden className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" style={{ animation: "jqBob 6s ease-in-out infinite" }} />
            <div aria-hidden className="absolute -bottom-12 -left-8 h-44 w-44 rounded-full bg-white/10" style={{ animation: "jqBob 7s ease-in-out infinite" }} />
            <h2 className="relative font-display text-2xl font-extrabold sm:text-3xl">{t("guest.cta.title")}</h2>
            <p className="relative mx-auto mt-2 max-w-md text-[14.5px] opacity-90">
              {t("guest.cta.body")}
            </p>
            <Link href="/login" className="relative mt-6 inline-block rounded-[14px] bg-card px-8 py-3.5 text-[15px] font-bold text-brand-deep shadow-card transition hover:brightness-95">
              {t("guest.cta.button")}
            </Link>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-line/60 py-6 text-center text-[12.5px] text-subtle">
        {t("guest.footer")}{" "}
        <Link href="/login" className="font-semibold text-brand">
          {t("guest.footer.signIn")}
        </Link>
      </footer>
    </div>
  );
}
