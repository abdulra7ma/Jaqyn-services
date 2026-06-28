# Jaqyn Design System

> Bishkek Local Rewards · v1.0 · developer reference
> Source of truth for color, type, shape and the UI primitives used across the
> customer, staff and business apps. An interactive version lives next to this
> file at `docs/design-system.dc.html`.

**Agents writing UI must read this file first.** Do not invent colors, radii,
shadows, or type scales — pull them from here, and prefer the Tailwind tokens in
`@jaqyn/config` (`frontend/packages/config/tailwind-preset.js`) over raw values.

---

## 0. Using this in code (Tailwind mapping)

The Tailwind preset in `@jaqyn/config` is the runtime source of truth. Use the
class, not the hex. Mapping from the tokens below:

| Design token | Hex | Tailwind class |
|---|---|---|
| `--ink` | `#2E241D` | `text-ink` / `bg-ink` |
| `--soft` | `#8C7A6A` | `text-subtle` (preset names it `subtle`) |
| `--cream` | `#FBF6EE` | `bg-cream` |
| `--board` | `#E7DCC9` | `bg-board` |
| `--card` | `#FFFFFF` | `bg-card` |
| `--line` | `#EFE3D1` | `border-line` |
| `--accent` | `#C25E3C` | `bg-brand` / `text-brand` |
| `--accent-deep` | `#A2492A` | `brand-deep` |
| `--amber` | `#E7A23E` | `amber` (`amber-deep` = `#B07A1E`) |
| `--sage` | `#5E8B6A` | `sage-deep`; `sage` = `#3F7355` (success fg), `sage-soft` = `#E4F0E7` |
| radius `pill` | `99px` | `rounded-pill` |
| radius `card` | `14px` | `rounded-xl` |
| shadow Accent | — | `shadow-glow` |
| shadow Soft/Float | — | `shadow-card` |
| brand gradient | — | `bg-brand-gradient` |

**Known gaps** (extend the preset, don't hardcode, when you hit these):
- `--tile` (`#F4ECDF`) — no Tailwind token yet.
- Status / voucher tints (§1) — not yet in the preset.

When a value below has no class, add it to `tailwind-preset.js` rather than
inlining a hex. All user-facing copy goes through `@jaqyn/i18n` — never hardcode.

---

## 1. Color

Surfaces are warm off-whites layered on a kraft-paper board. Terracotta carries every primary action; sage and amber are reserved for status and emphasis.

### Core palette

| Token | Hex | Use |
|---|---|---|
| `--ink` | `#2E241D` | Primary text, dark surfaces |
| `--soft` | `#8C7A6A` | Secondary text, captions |
| `--cream` | `#FBF6EE` | App screen background |
| `--board` | `#E7DCC9` | Canvas behind the app |
| `--card` | `#FFFFFF` | Cards, sheets, inputs |
| `--line` | `#EFE3D1` | Hairline borders |
| `--tile` | `#F4ECDF` | Icon-tile backgrounds |
| `--accent` | `#C25E3C` | Primary actions, brand (terracotta) |
| `--accent-deep` | `#A2492A` | Gradient end, pressed state |
| `--amber` | `#E7A23E` | Highlights, "new" |
| `--sage` | `#5E8B6A` | Success, confirmations |

### Status & semantic

Status pills tint the background at ~10–16% over the foreground hue.

| Meaning | fg | bg | Use |
|---|---|---|---|
| Open now / positive | `#3F7355` | `#E4F0E7` | Live, enrolled |
| Upcoming / pending | `#B07A1E` | `#FBEFD9` | Scheduled, near goal |
| Ended / neutral | `#9A8B7B` | `#F2EEE7` | Inactive, closed |
| At risk / destructive | `#B0563A` | `rgba(176,86,58,.12)` | Churn warning, delete |

### Voucher cues

| Kind | fg | bg | Emoji |
|---|---|---|---|
| Birthday gift | `#9D4E7C` | `#F6E8F1` | 🎂 |
| Welcome gift | `#4E6B9D` | `#E8EEF6` | 👋 |
| Coupon | `#B07A1E` | `#FBEFD9` | 🎟️ |

---

## 2. Typography

Two families, no exceptions.
**Bricolage Grotesque** sets every display and heading with tight tracking. **Hanken Grotesk** handles body, labels and UI copy.

```
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,600;12..96,700;12..96,800&family=Hanken+Grotesk:wght@400;500;600;700&display=swap');
```

| Role | Family | Weight | Size / line | Tracking |
|---|---|---|---|---|
| Display | Bricolage Grotesque | 800 | 28 / 1.05 | -1.5% |
| Title | Bricolage Grotesque | 700 | 24 | -1% |
| Heading | Bricolage Grotesque | 700 | 17 | — |
| Body | Hanken Grotesk | 400 | 14.5 / 1.55 | — |
| Label | Hanken Grotesk | 700 | 12.5 | uppercase, .04em |
| Micro | Hanken Grotesk | 700 | 10.5 | .02em |

> Minimum body / UI copy is 12.5px. Numbers and headings use Bricolage; everything tappable uses Hanken.
> In code: `font-display` (Bricolage) and `font-sans` (Hanken) from the preset.

---

## 3. Shape, elevation & spacing

### Radius

| Token | Value | Applied to |
|---|---|---|
| control | `9px` | Segmented-control thumb |
| tile | `14px` | Icon tiles |
| input | `15px` | Text fields |
| button | `16px` | Primary buttons |
| card | `18–24px` | Cards, sheets, modals |
| pill | `99px` | Pills, chips, status badges |

### Spacing — 4px base

`4` micro/icon gaps · `8` inline chips · `12` list-row gap · `16` card padding · `20` section blocks · `24` screen padding · `32` major sections.

### Elevation

Low-opacity, warm-tinted, tightly spread — a lift off paper, not a hard drop.

| Name | Value | Use |
|---|---|---|
| Subtle | `0 2px 8px rgba(46,36,29,.05)` | Resting cards, toolbars |
| Soft | `0 8px 24px -16px rgba(46,36,29,.3)` | Raised cards, checklists |
| Raised | `0 8px 22px -14px rgba(46,36,29,.45)` | Hoverable / tappable cards |
| Float | `0 12px 28px -18px rgba(46,36,29,.5)` | Detail cards, popovers |
| Accent | `0 12px 26px -8px rgba(160,73,42,.6)` | Primary buttons only |

---

## 4. Buttons

One terracotta primary per view. Full-width primaries anchor mobile screens; pill buttons float over content; ghost and danger variants stay quiet.

| Variant | Spec |
|---|---|
| Primary | `radius:16px; padding:15px 28px; background:var(--accent); color:#fff; font:700 15px Hanken;` + accent shadow. Max one per screen. |
| Pill | `radius:99px` — floats over scrolling content (QR, collect). |
| Secondary | `background:#fff; border:1.5px solid var(--line); color:var(--ink)` |
| Ghost | `background:transparent; color:var(--soft)` |
| Danger | `color:#B0563A; border:1px solid #E4B8AC; background:#fff` |
| Disabled | Primary at `opacity:.45; cursor:not-allowed` |
| Icon | `44px` min (touch-target floor); radius 13 (square) or 50% (round) |

Shared button primitives live in `@jaqyn/ui` — import, don't re-implement.

---

## 5. Inputs & controls

Fields use a 1.5px line border that thickens to terracotta on focus (`box-shadow:0 0 0 4px rgba(194,94,60,.12)`). Labels sit above in the soft caption style.

- **Text field** — `border:1.5px solid var(--line); radius:15px; padding:14px; font:600 15px Hanken`. Prefix (e.g. `+996`) sits inline before the input.
- **Textarea** — same border/radius; `resize:none`.
- **Switch** — track `46×28`, radius 99; off `#E0D3BF`, on `var(--accent)`. Knob `22px` white circle, `translateX(18px)` on.
- **Checkbox** — `22px` square, radius 7; fills `var(--sage)` with white ✓ when checked.
- **Stepper** — `−  value  +` inside a `1.5px` line border, radius 13; 42px hit cells.

---

## 6. Selection — segmented control & tabs

- **Segmented control** — white tray, `padding:5px; radius:13px`. Active thumb: `background:var(--accent); color:#fff; radius:9px`. Inactive: `transparent; color:var(--soft)`. Used for personas and time ranges.
- **Underline tabs** — `font:700 14px Hanken`; active `color:var(--ink)` with `2px` accent bottom border; inactive `color:var(--soft)`. Used for detail views.

---

## 7. Badges, chips & tags

- **Status pills** — `font:700 11.5px Hanken; padding:4px 11px; radius:99px`; tinted bg + colored fg (see §1 semantic table).
- **Filter chips** — `padding:8px 16px; radius:99px`. Active: accent fill, white text. Inactive: white fill, `1px` line border, soft text.
- **Attribute tags** — `padding:6px 13px; radius:99px; #fff; 1px line border`. Optional leading dot in `--amber` for "new".

---

## 8. Cards, list rows & avatars

The workhorse pattern: a **46–52px rounded icon tile** + title/sub stack + trailing chevron or badge.

- **List row** — `background:#fff; border:1px solid var(--line); radius:18px; padding:14–15px; gap:13–14px`. Subtle shadow.
- **Avatar** — rounded square (`radius:14px`) or circle; initials in `Bricolage 700`, `color:var(--accent)` on `--tile`. Stacked avatars overlap `-12px` with `2.5px` white ring.
- **Featured card** — `linear-gradient(150deg, var(--accent), var(--accent-deep))`, white text, `radius:24px`, accent glow, decorative translucent circle bleed. In code: `bg-brand-gradient`.

---

## 9. Progress & loyalty meters

Filled state is terracotta; empty is the tile tone.

- **Bar** — `height:10px; radius:99px; background:var(--tile)`; fill `linear-gradient(var(--accent), var(--accent-deep))`. For points / cashback.
- **Stamp grid** — `repeat(3,1fr)` tiles, `radius:13px`. Filled: accent bg + white glyph. Empty: `--tile` with `1.5px dashed #D8C8B0`. For punch cards.
- **Ring** — `conic-gradient(var(--accent) 0% N%, var(--tile) N% 100%)` with a white inner disc. For campaign goals.

---

## 10. Overlays, banners & empty states

- **Modal** — centered white card, `radius:24px`, `box-shadow:0 30px 60px -24px rgba(20,16,11,.6)`, on `rgba(46,36,29,.34)` backdrop. Success icon: `64px` sage circle, `jqPop` animation.
- **Bottom sheet** — `radius:24px 24px 0 0`; `42×5` grab handle in `#E0D3BF`; same card content language.
- **Toast** — dark `--ink` pill, fixed bottom-center, `radius:14px`; slides up (`jqToast`) and auto-dismisses at **2.2s**.
- **Info banner** — tinted bg (e.g. `#E8EEF6`), `radius:16px`, leading glyph.
- **Empty state** — `1px dashed #D8C8B0` card, `radius:18px`; `--tile` icon tile, title in Bricolage, soft sub, single accent CTA.

---

## Animations

| Keyframe | Effect |
|---|---|
| `jqIn` | Subtle 10px rise on screen enter |
| `jqPop` | Scale bounce (success ticks) |
| `jqToast` | Fade + 12px slide-up |
| `jqCardIn` | 16px rise + slight scale for detail cards |
| `jqPing` | Expanding ring (map "you" pin) |

---

*Generated from the live Jaqyn product. Keep this file and `tailwind-preset.js` in
sync — when one changes, update the other in the same PR.*
