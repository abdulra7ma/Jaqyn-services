# Responsive Sheet System — Implementation Plan

> Source of this plan: the Bottom-Sheet Opportunity Audit (2026-06-29). This
> doc is the spec for consolidating four hand-rolled bottom sheets into one
> design-system-grounded primitive set in `@jaqyn/ui`, then converting the
> highest-impact surfaces. Branch off `main`; ship per phase via PR.

## Goal

One overlay system that gives the **best UX for every user class**:

- **Mobile customer** & **mobile staff** (phone-first): bottom **Drawer** (Vaul),
  thumb-reachable, drag-to-dismiss, snap points where content earns them.
- **Desktop business owner** (OwnerShell sidebar): **Dialog** (centered) or side
  panel — thumb-reach rationale does not apply.

The same component renders the right thing per viewport (`Drawer` < `md`,
`Dialog` ≥ `md`) so callers do not branch.

## Engine decision (locked)

**Vaul (shadcn Drawer) on mobile + Radix Dialog on desktop.** Adds
`vaul` + `@radix-ui/react-dialog` to `@jaqyn/ui`. The four existing hand-rolled
sheets (`BottomSheet`, `BusinessSheet`, `MyQrSheet`, `SheetBackdrop`/`SHEET_STYLE`)
and `useSheetDrag` are retired onto this. Rationale: snap points, focus trap,
scroll lock, a11y roles, and exit animation come for free and tested, instead of
four divergent hand-rolls (z-index 55/60/70/80, scrim .45/.55, drag/no-drag).

## Design-system grounding

**`docs/design-system.dc.html` is the PRIMARY visual source — it holds the actual
rendered component CSS. `docs/design-system.md` is the secondary/prose reference.**
Where they disagree, the HTML wins. The values below were extracted from the HTML's
rendered markup (it's a bundled `.dc` page; tokens live in plaintext inline styles).
**Do not invent radii/scrim/shadow.** Where a value has no preset token, **extend
`tailwind-preset.js` in the same PR** (frontend rule) — never inline a raw hex/px.

### Canonical values pulled from the HTML (verbatim)

```
/* bottom sheet surface */
background:#fff; border-radius:24px 24px 0 0; padding:10px 22px 22px;
box-shadow:0 -20px 40px -24px rgba(20,16,11,.5);          /* TOP shadow — md omits this */
/* grabber */            width:42px; height:5px; border-radius:99px; background:#E0D3BF; margin:0 auto 16px;
/* scrim (sheet + modal) */ background:rgba(46,36,29,.34);   /* = ink @ .34 */
/* enter */              animation: jqRise .34s;             /* md/code say .32s — use .34s */
/* max height rule */    "~42–54px of exposed scrim at the top — the sheet never goes fully full-screen"
/* sheet title */        font:700 17px 'Bricolage Grotesque';   /* Heading */

/* centered modal */
backdrop: rgba(46,36,29,.34);
card: width:300px; background:#fff; border-radius:24px; padding:22px;
      box-shadow:0 30px 60px -24px rgba(20,16,11,.6); text-align:center;
success icon: 64px; border-radius:50%; background:var(--sage); color:#fff;  /* + jqPop */
```

> Doc variance: the HTML's annotation chips label the grabber "40×5 #D8CABB" while
> the rendered component uses **42×5 #E0D3BF**. Use the rendered value (42×5
> #E0D3BF); md §10 agrees. When in doubt, open the HTML and read the inline style.

### Token / class actions

| Element | Value (HTML) | Class / token action |
|---|---|---|
| Sheet top radius | `24px 24px 0 0` | add `borderRadius.sheet = "24px 24px 0 0"` → `rounded-sheet` |
| Modal/Dialog radius | `24px` | add `borderRadius['2xl'] = "24px"` if absent → `rounded-2xl` |
| Grab handle | `42×5`, `#E0D3BF`, radius 99 | add `colors.handle = "#E0D3BF"` → `h-[5px] w-[42px] bg-handle rounded-pill mx-auto mb-4` |
| Scrim (sheet + modal) | `rgba(46,36,29,.34)` | `bg-ink/[0.34]` (replaces current .45/.55) |
| Sheet shadow (top) | `0 -20px 40px -24px rgba(20,16,11,.5)` | add `boxShadow.sheet` → `shadow-sheet` |
| Modal shadow | `0 30px 60px -24px rgba(20,16,11,.6)` | add `boxShadow.modal` → `shadow-modal` |
| Sheet surface | `#fff` / `bg-board` for detail | `bg-card` default, `surface` prop override |
| Sheet padding | `10px 22px 22px` | `pt-2.5 px-[22px] pb-[22px]` (+ safe-area added to pb) |
| Max height | leave **42–54px scrim** at top | `max-h-[calc(100dvh-48px)]` — never `100dvh` |
| Safe area | `env(safe-area-inset-bottom)` | `pb-[env(safe-area-inset-bottom,16px)]` |
| Enter motion | `jqRise .34s` | Vaul owns drawer anim; Dialog uses `jqRise .34s` |
| Snap-point peek | glance→half→full | Vaul `snapPoints={[...]}` |
| Sheet title | `Bricolage 700 / 17px` | `font-display font-bold text-[17px]` |
| Destructive button | §4 Danger `#B0563A` / `1px #E4B8AC` / `#fff` | reuse `@jaqyn/ui` Button danger variant |

Preset + BOTH design-system files share the same tokens — when you add a token to
`tailwind-preset.js`, add the matching row to `docs/design-system.md` §0 in the same
change (frontend rule). The `.dc.html` is generated, not hand-edited — read it, don't
edit it.

## Public API (`@jaqyn/ui`)

New exports from `packages/ui/src/index.ts`:

```ts
// Sheet.tsx — responsive: Drawer (<md) / Dialog (>=md)
export function Sheet(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;        // header/handle/scroll provided by the shell
  variant?: "modal" | "persistent"; // persistent = no scrim (e.g. MyQrSheet)
  snapPoints?: (number | string)[]; // expanding peek->half->full (mobile only)
  surface?: "card" | "board";       // §8 surface tone
  side?: "bottom" | "right";        // desktop side-panel option (staff detail)
  ariaLabel: string;                // i18n string, required (a11y)
}): JSX.Element;

// Dialog.tsx — always centered modal (both viewports)
export function Dialog(props: { open; onOpenChange; title; children; ariaLabel }): JSX.Element;

// AlertDialog.tsx — binary/destructive confirm (both viewports)
export function AlertDialog(props: {
  open; onOpenChange;
  title: string;            // i18n
  description?: string;     // i18n
  confirmLabel: string;     // i18n
  cancelLabel: string;      // i18n
  onConfirm: () => void;
  destructive?: boolean;    // -> Button danger variant
  pending?: boolean;        // disable confirm while mutation runs
}): JSX.Element;
```

Rules: all `*Label`/`title`/`description` are **i18n strings passed by the caller**
(no hardcoded copy in the primitive — frontend i18n rule). Props explicitly typed,
no `any`. Single z-index scale defined once in the primitive (kill 55/60/70/80).

## Phases (gated; opus reviews + runs typecheck/lint/test between each)

### Phase 1 — Primitives (prerequisite, zero UX change elsewhere)
1. Add `vaul`, `@radix-ui/react-dialog` to `packages/ui/package.json` (workspace install).
2. Extend `tailwind-preset.js`: `rounded-sheet`, `bg-handle`, `shadow-modal`
   (+ matching rows in `docs/design-system.md` §0 table).
3. Verify `apps/web/tailwind.config` `content` globs already include
   `../../packages/ui/src/**` (ui ships source, app compiles the classes). Add if missing.
4. Build `Sheet`, `Dialog`, `AlertDialog`; export from `index.ts`.
5. Tests (Vitest + RTL): open/close, scrim click dismiss, ESC, focus trap,
   `ariaLabel` wired, AlertDialog confirm/cancel fires correct handler, destructive
   uses danger variant. Behavior not implementation (query by role/text).
**Gate:** `pnpm -w typecheck && lint && test` green. No visual change to the app yet.

### Phase 2 — Migrate the 4 existing sheets (no UX change)
Retarget onto `Sheet`, delete the hand-rolls + `useSheetDrag` once unreferenced:
- `BottomSheet` (nested loyalty list) → `Sheet variant="modal"`.
- `BusinessSheet` + `BusinessDetailsContent.tsx:329` (nearby peek) → `Sheet surface="board"` + snap points.
- `MyQrSheet` (`/qr`, nearby collect) → `Sheet variant="persistent"` (no scrim).
- `SheetBackdrop`/`SHEET_STYLE` (staff scan chooser/keypad/result) → `Sheet variant="modal"`.
**Gate:** staff-scan + nearby flows verified in preview (these are the reference UX —
must look/behave identical). Existing `nearby/[id]/page.test.tsx` still green.

### Phase 3 — Top conversions (the visible UX wins)
- **Group invite → share sheet.** `campaigns/[id]/group/invite/page.tsx` → `Sheet`
  over the group screen for in-app invites; keep the route as deep-link fallback.
- **VoucherItemSheet → real sheet.** `campaign-wallet/[id]/page.tsx:28` catalog
  item picker renders as `Sheet variant="modal"` instead of a full-page takeover mid-redemption.
- **Native `confirm()` → AlertDialog.** `business/staff/page.tsx:312,410`
  (remove staff / cancel invite, destructive) and `business/onboarding/OnboardingFlow.tsx:587`
  (Submit for verification — also fix its hardcoded English to i18n keys).
**Gate:** new RTL tests per converted surface; preview-verify each on mobile width;
desktop owner surfaces verified as Dialog ≥ md.

### Out of scope (explicitly NOT converting — from the audit)
Auth/signup/login/forgot-password multi-step routes; onboarding tours; SocialPostStudio
(desktop 940px tool); language `<select>` (native is lighter). Leave as-is.

## Repo guardrails (must hold)
- Branch `feat/responsive-sheet-system` off `main`; PR per phase, review before merge.
- `strict` TS, no `any`, no `!` without comment; a11y: roles, focus, ESC, labelled.
- All copy via `@jaqyn/i18n`. Conventional Commits. No `console.log`.
- QR-bearing sheets stay client-only; do not break the camera cleanup in staff scan.
- Playwright e2e: add if the harness is wired; if not installed, state that plainly
  and cover with RTL (do not silently claim e2e).

## Execution model
- **Orchestrator: Opus** (this session) — owns the plan, reviews each phase diff,
  runs typecheck/lint/test, gates progression, handles design-system conformance.
- **Implementer: Sonnet** subagents — one phase at a time (phases are sequential),
  each returns a diff summary + test results for review before the next is dispatched.
