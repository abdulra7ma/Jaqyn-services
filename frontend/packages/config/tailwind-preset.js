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
      },
      fontFamily: {
        display: ["var(--font-display)", "Bricolage Grotesque", "system-ui", "sans-serif"],
        sans: ["var(--font-sans)", "Hanken Grotesk", "system-ui", "sans-serif"],
      },
      borderRadius: {
        xl: "0.875rem", // 14px — cards
        pill: "99px",
      },
      boxShadow: {
        glow: "0 12px 24px -8px rgba(160,73,42,.5)",
        sage: "0 16px 36px -10px rgba(94,139,106,.6)",
        card: "0 10px 28px -16px rgba(46,36,29,.25)",
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(150deg, #C25E3C, #A2492A)",
      },
    },
  },
  plugins: [],
};
