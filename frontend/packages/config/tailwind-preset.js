/** Shared Tailwind preset for all Jaqyn apps.
 *  Design language extracted from Jaqyn.dc.html: warm terracotta + cream + sage,
 *  Bricolage Grotesque (display) + Hanken Grotesk (body), pill buttons, soft glow. */
/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors: {
        // primary — terracotta
        brand: {
          DEFAULT: "#C25E3C",
          deep: "#A2492A",
          fg: "#ffffff",
          muted: "#FBEFD9",
        },
        // surfaces & text
        cream: "#FBF6EE",
        board: "#E7DCC9",
        card: "#FFFFFF",
        line: "#EFE3D1",
        ink: "#2E241D",
        subtle: "#8C7A6A",
        // semantic
        sage: { DEFAULT: "#3F7355", soft: "#E4F0E7", deep: "#5E8B6A" },
        amber: { DEFAULT: "#E7A23E", deep: "#B07A1E" },
        // group/social accent (design-system §1 voucher-welcome indigo) — text + soft chip fill
        indigo: { DEFAULT: "#4E6B9D", soft: "#E8EEF6" },
        ok: "#3F7355",
        danger: "#B42318",
        // icon-tile backgrounds (design-system §1 --tile; §8 icon tiles, §10 empty-state)
        tile: "#F4ECDF",
        // sheet grab-handle tone (design-system §10 bottom-sheet grabber #E0D3BF)
        handle: "#E0D3BF",
        "reward-warm": "#FBEEE7",
        "reward-ready-border": "#D6E6D8",
      },
      fontFamily: {
        display: ["var(--font-display)", "Bricolage Grotesque", "system-ui", "sans-serif"],
        sans: ["var(--font-sans)", "Hanken Grotesk", "system-ui", "sans-serif"],
      },
      borderRadius: {
        xl: "0.875rem", // 14px — cards
        modal: "24px", // centered modal / dialog radius (design-system §3 / §10)
        sheet: "24px 24px 0 0", // bottom-sheet top corners (design-system §10 / .dc.html)
        pill: "99px",
        "reward-card": "22px",
      },
      spacing: {
        "reward-card": "17px",
      },
      boxShadow: {
        glow: "0 12px 24px -8px rgba(160,73,42,.5)",
        sage: "0 16px 36px -10px rgba(94,139,106,.6)",
        card: "0 10px 28px -16px rgba(46,36,29,.25)",
        // bottom-sheet TOP shadow — lift off the page above the sheet (.dc.html)
        sheet: "0 -20px 40px -24px rgba(20,16,11,.5)",
        // centered-modal drop shadow (design-system §10 / .dc.html)
        modal: "0 30px 60px -24px rgba(20,16,11,.6)",
        // Stacked drop shadow for a card that reads as a real, floating physical
        // object (landing hero cards use the same two-layer recipe): a deep soft
        // cast far below + a tighter contact shadow just under the edge.
        "card-float": "0 28px 50px -18px rgba(46,30,18,.5), 0 10px 20px -12px rgba(46,30,18,.42)",
        "reward-card": "0 16px 34px -20px rgba(46,30,18,.42)",
        "reward-cta": "0 10px 22px -10px rgba(160,73,42,.6)",
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(150deg, #C25E3C, #A2492A)",
        "reward-progress": "linear-gradient(162deg, #FFFFFF, #FBF1E8)",
        "reward-ready": "linear-gradient(162deg, #FFFFFF, #EEF5EE)",
        // Wallet card-face accents (loyalty wallet, design-system §8 "Featured
        // card"). Each value pulls from the §1 core palette + voucher cues; a
        // card's accent is chosen deterministically by business id, so these are
        // fixed named gradients, not per-card inline hex. Keep in sync with the
        // CARD_ACCENTS list in app/loyalty/_lib/wallet.ts.
        "wallet-terracotta": "linear-gradient(150deg, #C25E3C, #A2492A)", // §1 --accent / --accent-deep
        "wallet-amber": "linear-gradient(150deg, #E7A23E, #B07A1E)", // §1 --amber / amber-deep
        "wallet-sage": "linear-gradient(150deg, #5E8B6A, #3F7355)", // §1 --sage / sage success fg
        "wallet-plum": "linear-gradient(150deg, #9D4E7C, #743A5C)", // §1 voucher birthday fg, deepened
        "wallet-indigo": "linear-gradient(150deg, #4E6B9D, #394F75)", // §1 voucher welcome fg, deepened
        // Kraft board canvas — warm diagonal weave (patch board + share artboard).
        // Two repeating diagonal gradients create a crosshatch texture over a warm base.
        "patch-board":
          "linear-gradient(160deg, #E7DCC9 0%, #D9CCB3 100%), " +
          "repeating-linear-gradient(45deg, rgba(0,0,0,.025) 0px, rgba(0,0,0,.025) 1px, transparent 1px, transparent 8px), " +
          "repeating-linear-gradient(-45deg, rgba(0,0,0,.025) 0px, rgba(0,0,0,.025) 1px, transparent 1px, transparent 8px)",
        // Share artboard — same weave, slightly deeper contrast for export legibility.
        "patch-share-board":
          "linear-gradient(160deg, #E7DCC9 0%, #D9CCB3 100%), " +
          "repeating-linear-gradient(45deg, rgba(0,0,0,.03) 0px, rgba(0,0,0,.03) 1px, transparent 1px, transparent 8px), " +
          "repeating-linear-gradient(-45deg, rgba(0,0,0,.03) 0px, rgba(0,0,0,.03) 1px, transparent 1px, transparent 8px)",
      },
      // ---- Motion tokens (campaigns redesign — mockup-spec.md "Animations") ----
      // All gated by useReducedMotion() in consuming components. Do not add
      // `animation` classes directly to layout elements — only interactive /
      // moment components use these.
      keyframes: {
        // Streak flame (campaigns tab header chip).
        // 0/100%: resting; 50%: peak wobble. Source: mockup-spec.md §Animations.
        "jq-flame": {
          "0%, 100%": { transform: "scale(1) rotate(-3deg)" },
          "50%": { transform: "scale(1.14) rotate(3deg)" },
        },
        // CTA attention pulse — white ring grows + fades. Used on primary QR CTAs.
        "jq-ask": {
          "0%, 100%": {
            boxShadow: "0 0 0 0 rgba(255,255,255,0.5)",
            transform: "scale(1)",
          },
          "50%": {
            boxShadow: "0 0 0 10px rgba(255,255,255,0)",
            transform: "scale(1.1)",
          },
        },
        // Invite button pulse — terracotta ring. Spread 7px per spec.
        "jq-ask-d": {
          "0%, 100%": {
            boxShadow: "0 0 0 0 rgba(194,94,60,0.45)",
            transform: "scale(1)",
          },
          "50%": {
            boxShadow: "0 0 0 7px rgba(194,94,60,0)",
            transform: "scale(1.1)",
          },
        },
        // Win-moment card enters from below. One-shot .32s.
        "jq-card-up": {
          "0%": { transform: "translateY(34px)", opacity: "0.3" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        // Confetti piece falls + spins. Duration/delay applied per-piece inline
        // (1.1–2.2s / 0–.9s). `fill-mode: forwards` for win overlay,
        // `iteration: infinite` for earn-moment overlay.
        "jq-confetti": {
          "0%": { transform: "translateY(0) rotate(0deg)", opacity: "1" },
          "100%": { transform: "translateY(760px) rotate(720deg)", opacity: "0" },
        },
        // Patch pop into earned sheet. 3-step spring.
        "jq-patch-in": {
          "0%": { transform: "scale(0.4) rotate(-7deg)", opacity: "0" },
          "60%": { transform: "scale(1.07) rotate(2deg)", opacity: "1" },
          "100%": { transform: "scale(1) rotate(0deg)", opacity: "1" },
        },
        // Earn-moment patch pop. More dramatic than patch-in.
        "jq-pop": {
          "0%": { transform: "scale(0.3)", opacity: "0" },
          "55%": { transform: "scale(1.18)", opacity: "1" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        // Sheet / overlay rise-in. Lightweight.
        "jq-rise": {
          "0%": { transform: "translateY(20px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        // Gentle idle bob — hero avatar + wallet-style cards on the QR landing
        // screen "float" like the physical cards in the loyalty wallet. Amplitude
        // 8px; loops forever. Gate behind useReducedMotion() in the component.
        "jq-float": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-8px)" },
        },
        // Physical-card suspension — a wider vertical bob (12px) plus a barely
        // there sway (±0.7deg) so a full card reads as hanging in space, not just
        // sliding. Mirrors the landing hero's floating cards (jqFloatA/B).
        "jq-card-float": {
          "0%, 100%": { transform: "translateY(0) rotate(-0.7deg)" },
          "50%": { transform: "translateY(-12px) rotate(0.7deg)" },
        },
        // Pulsing status dot — scale + fade, mirrors the landing site's jqDot
        // "live / arriving now" indicator.
        "jq-dot": {
          "0%, 100%": { transform: "scale(1)", opacity: "0.5" },
          "50%": { transform: "scale(1.5)", opacity: "1" },
        },
      },
      animation: {
        // Streak flame: 2.4s ease-in-out loop.
        "jq-flame": "jq-flame 2.4s ease-in-out infinite",
        // QR CTA pulse: white ring, 1.8s loop.
        "jq-ask": "jq-ask 1.8s ease-in-out infinite",
        // Invite button pulse: terracotta ring, 1.8s loop.
        "jq-ask-d": "jq-ask-d 1.8s ease-in-out infinite",
        // Win card enter: .32s spring.
        "jq-card-up": "jq-card-up 0.32s cubic-bezier(.22,1,.36,1) both",
        // Confetti (win overlay — forwards, no loop): applied per-piece via
        // inline style for duration/delay variation. Use `animate-jq-confetti`.
        "jq-confetti": "jq-confetti 1.6s ease-in forwards",
        // Confetti (earn moment — infinite loop): a separate utility so both
        // modes work from the same keyframe.
        "jq-confetti-loop": "jq-confetti 1.6s ease-in infinite",
        // Patch pop into sheet: .5s ease.
        "jq-patch-in": "jq-patch-in 0.5s ease both",
        // Earn-moment patch pop: .55s/.6s (use .55s standard, .6s for emphasis).
        "jq-pop": "jq-pop 0.55s ease both",
        // Sheet / overlay rise: .3s ease.
        "jq-rise": "jq-rise 0.3s ease both",
        // Slower rise variant (.4s) for overlays that enter after content.
        "jq-rise-slow": "jq-rise 0.4s ease both",
        // Idle float: 4s ease-in-out loop. Avatar uses this; the reward card uses
        // the slower 5.5s variant so the two bob out of phase.
        "jq-float": "jq-float 4s ease-in-out infinite",
        "jq-float-slow": "jq-float 5.5s ease-in-out infinite",
        // Physical reward card suspension: 6s ease-in-out loop.
        "jq-card-float": "jq-card-float 6s ease-in-out infinite",
        // Status dot pulse: 1.6s loop (landing parity).
        "jq-dot": "jq-dot 1.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
