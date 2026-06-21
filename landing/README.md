# Jaqyn Landing

Marketing landing page for Jaqyn — local group rewards & QR loyalty for businesses in Bishkek.
React + Vite + TypeScript. Ported pixel-for-pixel from the `Jaqyn Landing.dc.html` design handoff.

## Run

```bash
npm install
npm run dev      # dev server → http://localhost:5173
npm run build    # typecheck + production build → dist/
npm run preview  # serve the production build
```

## Structure

```
index.html                 # entry, Google Fonts (Bricolage Grotesque + Hanken Grotesk)
src/
  main.tsx                 # React root
  App.tsx                  # I18nProvider + composition + page state (menu, FAQ, lead form)
  styles.css               # design tokens (CSS vars), keyframes, hover/focus, responsive
  theme.ts                 # accent constants + style helpers (avatar, iconTile)
  hooks/useLandingEffects.ts  # scroll-reveal, count-up, sticky-header state (IntersectionObserver)
  i18n/
    translations.ts        # ru / ky / en text dictionaries + language list + default
    content.ts             # merges translated text with static styles/structure → Content
    I18nContext.tsx        # provider, useI18n() hook, localStorage persistence
  components/              # one file per section; each reads text via useI18n()
    Header  Hero  HowItWorks  CustomerBenefits  BusinessBenefits
    DealsCarousel  QrLoyalty  ExampleCampaign  DashboardPreview
    Trust  Faq  LeadForm  FinalCta  Footer  MobileCta  LanguageSwitcher
```

## Languages

- Russian (default), Kyrgyz, English. Switcher (RU / KG / EN) lives in the header
  on desktop and in the mobile menu.
- Choice persists in `localStorage` (`jaqyn.lang`) and sets `<html lang>`. No saved
  choice → Russian (`DEFAULT_LANG` in `i18n/translations.ts`).
- All copy lives in `i18n/translations.ts`. Each section component pulls strings from
  `useI18n().content` — `content.t.*` for plain text, `content.<list>` for the
  styled/structured arrays (built in `content.ts`).
- To add a language: add a `Dict` in `translations.ts` and an entry to `languages` /
  `dictionaries`. Brand names (Manas Coffee, etc.), category form *values*, and pure
  numbers stay language-independent in `content.ts`.

## Notes

- Design tokens live as CSS variables on `:root` (`--accent #C25E3C`, `--ink`, `--cream`, etc).
  The prototype exposed `accent`/`accentDeep` as editor props; here they're constants in `theme.ts`
  + `styles.css` — change in both spots to re-theme.
- Interactions match the prototype: sticky header blur on scroll, mobile menu, FAQ accordion
  (`grid-template-rows` collapse), horizontal deals carousel with prev/next, count-up stats,
  scroll-reveal, and a lead form with a simulated submit → success state.
- The lead form is front-end only (1s fake submit). Wire `App.tsx` `handleSubmit` to a real
  endpoint to capture leads.
- Responsive breakpoints (880px / 560px) ported verbatim from the design.
