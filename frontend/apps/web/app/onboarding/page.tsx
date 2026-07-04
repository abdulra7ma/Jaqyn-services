"use client";

import { useUpdateProfile } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { Button } from "@jaqyn/ui";
import useEmblaCarousel from "embla-carousel-react";
import { useReducedMotion } from "framer-motion";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { GiftIcon, PinIcon, ScanIcon, UserIcon, UsersIcon } from "../_components/icons";

type SlideKey = "welcome" | "show_qr" | "track" | "discover" | "groups" | "done";

type SlideDef = {
  key: SlideKey;
  Icon: (p: { className?: string }) => JSX.Element;
  titleStatic: string;
  tint: string;
};

/** First-run product tour. Shown once to new customers; completion is persisted on the profile. */
const SLIDE_DEFS: SlideDef[] = [
  {
    key: "welcome",
    Icon: GiftIcon,
    titleStatic: "Welcome to Jaqyn",
    tint: "bg-brand/15 text-brand",
  },
  {
    key: "show_qr",
    Icon: ScanIcon,
    titleStatic: "Show your QR",
    tint: "bg-amber/20 text-amber",
  },
  {
    key: "track",
    Icon: GiftIcon,
    titleStatic: "Track your rewards",
    tint: "bg-brand/15 text-brand",
  },
  {
    key: "discover",
    Icon: PinIcon,
    titleStatic: "Discover nearby",
    tint: "bg-sage/20 text-sage",
  },
  {
    key: "groups",
    Icon: UsersIcon,
    titleStatic: "Team up in Groups",
    tint: "bg-amber/20 text-amber",
  },
  {
    key: "done",
    Icon: UserIcon,
    titleStatic: "You're all set",
    tint: "bg-brand/15 text-brand",
  },
];

const SLIDE_BODIES: Record<SlideKey, string> = {
  welcome: "Your loyalty, all in one place. Collect rewards from every café, salon and shop you love — no paper cards.",
  show_qr: "__i18n__", // filled from t("onboarding.welcomeSlide2")
  track: "The Rewards tab shows every card you're filling and what you can redeem right now.",
  discover: "Browse loyalty spots around you in the Nearby tab and start a new card in one tap.",
  groups: "Join friends in Groups to unlock shared offers and reach rewards together, faster.",
  done: "Manage your details and language anytime in Profile. Let's collect your first reward!",
};

/** One tour slide: icon tile, title, body, and (on the final slide) the first-stamp task. */
function Slide({ def, body, showTask }: { def: SlideDef; body: string; showTask: boolean }): JSX.Element {
  const t = useT();
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <div className={`flex h-20 w-20 items-center justify-center rounded-[26px] shadow-card ${def.tint}`}>
        <def.Icon className="h-9 w-9" />
      </div>
      <h1 className="mt-7 font-display text-[26px] font-bold text-ink sm:text-[29px]">{def.titleStatic}</h1>
      <p className="mt-3 max-w-[340px] text-[15px] leading-relaxed text-subtle">{body}</p>

      {showTask && (
        <div className="mt-6 w-full rounded-2xl border border-line bg-card px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="text-lg text-subtle">○</span>
              <span className="text-sm font-semibold text-ink">{t("onboarding.taskCollectStamp")}</span>
            </div>
            <Link
              href="/collect"
              className="rounded-pill bg-brand-gradient px-3 py-1.5 text-xs font-bold text-brand-fg shadow-glow"
            >
              {t("collect.title")}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function OnboardingFlow() {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const returnTo = params.get("return") || "/";
  const updateProfile = useUpdateProfile();
  const reduce = useReducedMotion();

  // Swipeable slide track. `duration` is Embla's scroll speed; 0 under reduced-motion
  // (Embla doesn't honor prefers-reduced-motion on its own — the codebase gates every
  // animation on useReducedMotion). watchDrag stays on so touch/mouse swipe works.
  const [emblaRef, embla] = useEmblaCarousel({ align: "start", containScroll: "trimSnaps", duration: reduce ? 0 : 24 });
  const [i, setI] = useState(0);
  const isLast = i === SLIDE_DEFS.length - 1;

  // Embla owns the source of truth for the current slide; mirror it into React state so
  // the dots and Next/Back labels stay in sync whether the user swipes or taps.
  useEffect(() => {
    if (!embla) return;
    const onSelect = (): void => setI(embla.selectedScrollSnap());
    embla.on("select", onSelect);
    onSelect();
    return () => {
      embla.off("select", onSelect);
    };
  }, [embla]);

  const back = useCallback((): void => embla?.scrollPrev(), [embla]);

  // Mark the tour seen, then send the user where they were headed.
  const finish = useCallback((): void => {
    updateProfile.mutate(
      { onboarding_completed: true },
      {
        onSuccess: () => router.replace(returnTo),
        onError: () => router.replace(returnTo), // never trap the user on the tour
      },
    );
  }, [updateProfile, router, returnTo]);

  const next = useCallback((): void => {
    if (isLast) finish();
    else embla?.scrollNext();
  }, [isLast, finish, embla]);

  const bodyFor = (key: SlideKey): string => {
    const raw = SLIDE_BODIES[key];
    return raw === "__i18n__" ? t("onboarding.welcomeSlide2") : raw;
  };

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-cream px-4 py-10 font-sans text-ink sm:px-6">
      {/* drifting background blobs — same language as the auth screen */}
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

      <div className="relative z-10 mx-auto flex w-full max-w-[420px] flex-1 flex-col">
        {/* progress dots — tap to jump to a slide */}
        <div className="flex items-center justify-center gap-2 pt-2">
          {SLIDE_DEFS.map((s, idx) => (
            <button
              key={s.key}
              type="button"
              onClick={() => embla?.scrollTo(idx)}
              aria-label={s.titleStatic}
              aria-current={idx === i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                idx === i ? "w-6 bg-brand" : "w-1.5 bg-line"
              }`}
            />
          ))}
        </div>

        {/* swipeable slide track (Embla viewport → container → slides). The viewport is a
            block box so the flex container inherits its width; making the viewport itself
            a flex row lets the container's min-width:auto overflow and double-measure slides. */}
        <div className="flex-1 overflow-hidden" ref={emblaRef}>
          <div className="flex h-full touch-pan-y">
            {SLIDE_DEFS.map((s) => (
              <div key={s.key} className="flex min-w-0 flex-[0_0_100%] flex-col">
                <Slide def={s} body={bodyFor(s.key)} showTask={s.key === "done"} />
              </div>
            ))}
          </div>
        </div>

        {/* controls */}
        <div className="flex flex-col gap-3 pb-2">
          <Button onClick={next} disabled={updateProfile.isPending}>
            {isLast ? (updateProfile.isPending ? "..." : "Get started") : "Next"}
          </Button>
          <div className="flex items-center justify-center">
            {i > 0 ? (
              <button type="button" className="text-sm font-semibold text-subtle hover:text-brand" onClick={back}>
                ‹ Back
              </button>
            ) : (
              <span className="text-sm text-transparent">‹ Back</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={null}>
      <OnboardingFlow />
    </Suspense>
  );
}
