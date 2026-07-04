---
title: UX Writing — voice, wording, and RU/EN copy rules
service: shared
type: reference
status: active
last_reviewed: 2026-07-04
---

# UX Writing — Jaqyn voice & wording reference

How to write (and translate) every user-facing string. Companion to
`docs/design-system.md` (visuals) and `frontend/packages/i18n/src/locales.ts`
(the dictionary). Russian is the primary language (`DEFAULT_LOCALE = "ru"`);
English is secondary. **Write RU first, then EN — not the other way around.**

## 1. The persona

Jaqyn sounds like **a friendly local barista who knows your order** — warm,
quick, a little playful, never corporate and never pushy.

- **Warm, not gushing.** «Ваша награда ждёт» — yes. «Поздравляем!!! Вы получили
  невероятный бонус!» — no.
- **Local.** Bishkek, сом, чайхана, районы города are part of the product's
  identity. Don't genericize them away.
- **Plain speech.** A 16-year-old and a 60-year-old both understand every
  screen on first read. If a sentence needs a second read, rewrite it.
- **Respectful «вы», lowercase.** Always polite form, never «Вы» mid-sentence,
  never «ты».
- **Celebrate small wins briefly.** One short line + at most one emoji at true
  reward moments (`🎁`, `🎉`). Nowhere else.

Three sub-audiences, same voice, different energy:

| App | Reader | Register |
|---|---|---|
| Customer | person in line for coffee | friendly, light («Ещё 2 визита — бесплатный капучино») |
| Business owner | busy owner between customers | clear and businesslike, zero fluff («Наград погашено: 12») |
| Staff | cashier mid-shift, glancing | imperative, instant («Наведите на QR клиента») |

## 2. Grammar of the UI

- **Buttons/actions = verb, infinitive.** «Сохранить», «Вступить»,
  «Показать QR». Never noun («Сохранение») or first person («Сохранить мои
  изменения»).
- **Labels/titles = noun.** «Настройки», «Награда», «Размер группы».
- **Sentence case** in both languages. No Title Case in EN, no ALL CAPS except
  deliberate tiny badges (`STAFF`, `NEW`).
- **Errors say what happened + what to do**, in one line, no blame, no codes:
  «Не удалось загрузить меню. Попробуйте ещё раз.»
- **Empty states sell the next step**, not the absence:
  «Пока нет карт — сканируйте QR заведения и начните копить.»
- **Ellipsis `…` (one char) for in-progress:** «Сохраняем…», «Загрузка…».
- **Numbers + units:** `120 сом`, `3 дн.`, `45 сек` — non-breaking space in
  mind, unit abbreviated where space is tight. EN uses `som` (Latin), RU «сом»,
  abbreviation «с» only in dense analytics cells.

## 3. Fixed vocabulary — one concept, one word

Never introduce a synonym for these. If EN says the left column, RU says the
right column, everywhere:

| Concept | EN | RU | Never |
|---|---|---|---|
| stamp | stamp | штамп | ~~отметка~~ (reserved for check-in) |
| check-in | check in | отметиться / окно отметки | |
| reward | reward | награда | ~~приз~~ ~~бонус~~ (bonus = welcome bonus only) |
| voucher | voucher | ваучер | ~~купон~~ (coupon = separate loyalty type) |
| redeem (customer does it) | use | использовать | |
| redeem (business/analytics) | redeemed | погашено | ~~использовано~~ in biz tables |
| issue (staff hands out) | give / issue | выдать | |
| campaign | campaign | акция | ~~кампания~~ |
| loyalty program | program | программа | |
| join a campaign | join | участвовать | |
| join a group/program | join | вступить | ~~присоединиться~~ (too long for buttons) |
| group offer | group offer | групповое предложение | ~~сделка~~ |
| business/venue | business | заведение (customer-facing), бизнес (owner-facing) | ~~merchant~~ in EN |
| points | points / pts | баллы | |
| cashback | cashback | кэшбэк | |
| visit | visit | визит | ~~посещение~~ |
| wallet | wallet | кошелёк | |
| patch (achievement) | patch | патч | |

## 4. Length rules (RU is ~30% longer — plan for it)

Priority order when a Russian string threatens the layout:

1. **Cut words, not meaning.** «Показать QR для начисления» → «QR для
   начисления». Most strings survive a 30–40% trim with zero loss.
2. **Abbreviate units, never verbs.** «дн.», «сек», «мин», «чел.», «шт.» are
   fine. «Исп-ть» is never fine.
3. **Keep the standard word, fix the layout.** «Использовать», «Копировать»,
   «Поделиться», «Отправить снова» are the platform-standard RU terms
   (Google/Apple convention). Do NOT invent shorter synonyms for them — make
   the container flexible instead (see §5).
4. **Flag for design** only when 1–3 all fail. Add the key to the PR
   description as `needs-layout-decision`.

Practical budget: a primary CTA should fit **≤ 20 RU characters**, a paired
half-width button **≤ 12**, a chip/tab **≤ 10**. If your RU draft is over
budget, it's a wording problem first, a layout problem second.

## 5. Layout contract for buttons (frontend side)

Copy rules only work because layouts hold up their end. Any component
rendering an i18n string must be RU-proof:

- **Never fixed-width text buttons.** Content-sized (`px-*`) or `w-full` or
  `flex-1` — those are the only three shapes.
- Pill-next-to-label rows: pill gets `flex-none`, label gets `min-w-0` so the
  text wraps and the button never compresses (see `_components/home.tsx` hero).
- **Never `truncate` on a button or action label.** Truncate is for
  user-generated content (URLs, names) only.
- Bottom navs and tab bars with > 4 slots are **icon-only** with `aria-label`
  (see `BottomNav.tsx`).
- Test at 375 px with RU locale before shipping any new button row.

## 6. Both languages, always

- Every key exists in **both** `ru` and `en` blocks of `locales.ts` in the
  same relative position. No hardcoded UI strings in components — including
  «temporary» ones like `Soon` badges (that's how the mixed-language login
  screen happened).
- Translate **intent, not words**. EN "You're almost there" → «Почти готово»,
  not «Вы почти там».
- RU uses «ё» consistently (кошелёк, ещё, истёк).
- Straight apostrophes in EN (`Couldn't`), «ёлочки» not required in RU — the
  file uses plain quotes; keep whatever the surrounding strings do.
- Plural forms: the current i18n layer is flat strings — RU plurals can't be
  inflected («{n} визита» breaks at n=1,5). Until ICU plurals land, prefer
  **abbreviation** («{n} дн.») or **label-colon form** («Визитов: {n}») over
  inflected nouns after a placeholder.

## 7. Quick self-check before committing a string

1. Would a barista say it out loud to a customer? (persona)
2. Verb for the button, noun for the label? (§2)
3. Does the word already exist in the glossary? (§3)
4. RU within the character budget? (§4)
5. Both locales updated, no hardcoded text? (§6)
