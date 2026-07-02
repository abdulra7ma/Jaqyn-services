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
        ok: "#3F7355",
        danger: "#B42318",
        // icon-tile backgrounds (design-system §1 --tile; §8 icon tiles, §10 empty-state)
        tile: "#F4ECDF",
        // sheet grab-handle tone (design-system §10 bottom-sheet grabber #E0D3BF)
        handle: "#E0D3BF",
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
      },
      boxShadow: {
        glow: "0 12px 24px -8px rgba(160,73,42,.5)",
        sage: "0 16px 36px -10px rgba(94,139,106,.6)",
        card: "0 10px 28px -16px rgba(46,36,29,.25)",
        // bottom-sheet TOP shadow — lift off the page above the sheet (.dc.html)
        sheet: "0 -20px 40px -24px rgba(20,16,11,.5)",
        // centered-modal drop shadow (design-system §10 / .dc.html)
        modal: "0 30px 60px -24px rgba(20,16,11,.6)",
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(150deg, #C25E3C, #A2492A)",
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
      },
    },
  },
  plugins: [],
};
