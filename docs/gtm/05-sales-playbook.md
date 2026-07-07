---
title: GTM 05 — Sales Strategy & Playbook
service: platform
type: strategy
status: active
last_reviewed: 2026-07-07
---

# Sales Strategy & Playbook — Jaqyn

**Who this is for:** Solo technical founder with no sales background. Bishkek
market; cafés first. Product demo runs on any phone. Manual invoicing;
no billing code yet. All Russian copy is ready to paste.

**Grounding docs (do not contradict them):**
- `01-positioning.md` — top 3 pains, ICP-A (café), messaging hierarchy
- `02-market-analysis.md` — real competitors: MBank cashback + paper cards + UDS
- `03-pricing.md` — Grow 990 / Business 1,990 KGS/mo; founding rate 690/1,490
  for first 25 businesses through 2026-10-31; manual invoice
- `04-marketing-strategy.md` — 120-lead café DB, Instagram, Telegram; 5 hrs/week

---

## 1. Sales Motion Recommendation

**Verdict: Founder-led direct sales. No self-serve, no partner channel yet.**

### The reasoning

**Price point (~$11–23/mo, 990–1,990 KGS) does not rule out self-serve on
its own** — plenty of SaaS at this price closes via a landing page. But three
forces together make founder-led the only viable motion right now:

1. **Product blockers make self-serve impossible.** SMS/OTP is a dev stub;
   invite emails don't send in production (positioning risk #5). A customer who
   tries to self-signup today hits a broken path. Until SMS lands, *every*
   new business requires the founder to onboard them by hand.

2. **KG business culture demands relationship before transaction.** A Bishkek
   café owner will not enter a bank-transfer payment for software they haven't
   seen, from a founder they've never spoken to, for a product with zero social
   proof. The sales motion must put a human in the loop — and that human is you
   for the first cohort.

3. **The product's value is not self-evident from a landing page.** The group
   "bring your friends" mechanic is the single uncontested differentiator, but
   reading about it is not the same as watching it live on the owner's phone.
   The 15-minute live demo is the sales motion; the landing page is the
   appointment-setting tool.

**Partner channel:** deferred to month 3+. Coffee equipment dealers, POS
resellers, and café supply vendors are high-leverage referral partners once
you have 5+ cafés running and a case study. At zero customers, you have
nothing to give a partner to sell with. Revisit when the playbook converts.

**Hybrid (partial self-serve):** viable at month 3–4 once SMS/OTP ships and
the first case study is live. The marketing strategy doc's "Café Founder 15"
outbound campaign (close 15 founding-rate cafés in 90 days) is the gate.
If 8+ cafés are on founding-rate plans by day 90, open self-serve. If not,
keep the founder-led motion and diagnose the demo script.

### What founder-led looks like in practice

You are the sales, demo, and onboarding team for cohort one (~first 25
businesses). This is a feature, not a bug: every conversation teaches you what
the demo needs to land, what objections repeat, what questions to add to the
product FAQ. That knowledge is irreplaceable. When the playbook is proven,
write it down and hand it to the first hire.

---

## 2. Prospecting Plan

### Where to find the first 50 prospects

**Source 1 — The 120-lead 2GIS café DB (primary — start here)**

You already have 120 pre-scored Bishkek café and coffee shop leads in
`backend/apps/leads/`. This is your day-one outreach list. It is pre-filtered
for loyalty fit and already has contact info. Work it before doing anything
else. Target: 5 contacts per week, which exhausts the list in 24 weeks —
but you only need 25 paying customers, so the list is plentiful.

*How to use it:* Export from the Django admin leads table. Sort by the score
or loyalty-fit column. Start with the highest-scored, highest-visit-frequency
cafés. Cross-reference with their Instagram account before each outreach:
look at their last 3 posts to find one thing to reference in the DM.

**Source 2 — Instagram café accounts in Bishkek**

Search Instagram: «кофейня Бишкек», «кафе Бишкек», «coffee Bishkek». Look
for accounts with 200–5,000 followers (small local venue, owner likely
personally runs the account), recent posts (active in the last week), and
menu/interior content (real business, not a food blogger).

*How to use it:* Follow, like 2–3 posts, wait 24 hours, then DM. The follow
warms the contact before the cold message arrives.

**Source 3 — Walking the coffee clusters (in-person)**

Bishkek's café density is highest in these areas:
- **Чуй / Chuy Avenue corridor** — between Манас/Manas and Советская/Sovetskaya
- **Манас / Manas Ave + side streets** — dense modern coffee shop strip
- **City Center / ЦУМ / Erkindik park area** — tourist-adjacent, higher ticket
- **Южная магистраль / South Magistral + Асаналиева** — residential density,
  regulars-driven

Walk into a cluster on a Tuesday or Thursday morning (off-peak). Have a
coffee. Observe: how many tables, how many covers per hour, is the owner
on-site, what does the counter flow look like. Pick 2–3 you would want as
a customer yourself. Come back for the owner conversation at a quieter moment
(not during the 08:00–09:30 rush; 10:00–11:30 or 14:00–16:00 is better).

**Source 4 — Telegram business communities**

Per the marketing strategy doc: join and observe before posting.
- «кофейни Бишкек предприниматели» (café owner group)
- «хорека Кыргызстан» (HoReCa KG)
- «бизнес Бишкек» / «ИП Кыргызстан» (small-business entrepreneur groups)
- «баристы Бишкек» (barista community, if active)

Owners who ask questions about repeat customers, promotions, or "how do you
attract guests" in these groups are warm prospects. DM them directly after
they post — reference their exact question.

**Source 5 — Referrals from founding customers (month 2+)**

Every founding café customer who is happy at the day-21 check-in is asked:
> «Вы в каких-нибудь группах для кофейников в Телеграме или знаете коллег,
> которым это было бы полезно? Приведите их — дам вам месяц бесплатно.»

One owner referral in a 200-member Telegram group of café owners is worth
50 cold DMs. Do not skip this ask.

---

### Qualification checklist — skip bad fits fast

Run this mentally or in conversation before booking a demo. Any hard "no"
below means move to the next prospect; do not waste a demo slot.

**Must-haves (hard qualification):**

| Check | What to look for | Fail signal |
|---|---|---|
| **Visit frequency** | Daily or weekly regulars plausible (café, coffee shop, juice bar) | Destination venue (events only, seasonal) — stamp loyalty won't prove out in 30 days |
| **Owner reachable** | Owner is on-site most days OR has one decision-making manager | Multi-location franchise with an off-site owner who needs HQ approval — sales cycle extends to months |
| **Staff count** | 2–15 staff | 0 (owner does everything, no capacity to scan) or 30+ (needs manager buy-in, multi-location, out of scope) |
| **Smartphone in use** | Owner and at least one staff member actively use a smartphone | Technophobe owner who manages everything via phone calls and a notebook — onboarding will fail |
| **No mandated POS loyalty** | Business is not a franchise with a required POS loyalty module (iiko/r_keeper/Poster-mandated) | «У нас программа от [поставщика POS]» with no flexibility |

**Nice-to-haves (qualify up, not out):**

| Check | Meaning |
|---|---|
| **Existing loyalty attempt** | Paper punch cards OR tried a loyalty app that failed. This is a warm signal — they have the problem and proved it to themselves. Address the failure directly in the demo. |
| **Instagram account active** | They care about customer relationships and marketing. More likely to engage with the group campaign mechanic. |
| **Slow weekday problem** | «Вторник–среда всегда пусто» — this is the exact trigger the group campaign is built for. |
| **Competition opened nearby** | Recent threat to their customer base makes retention feel urgent. |

**Explicit non-targets for the first cohort:**

- Salons and barbershops: correct ICP eventually, but 2–6 week visit cycle means
  the loyalty habit won't prove out in 30 days. Fast-follow after café playbook
  converts.
- Retail (boutiques, flower shops): most price-sensitive, thin margins, slowest
  to prove ROI. Month 3+.
- Large multi-location chains or restaurant groups: decision cycle is months,
  requires manager buy-in, wrong sales motion.
- Dark kitchens / delivery-only venues: no in-person QR scan moment.

---

## 3. Outreach Sequences

### Tone rules for all copy

- Use **«вы»** (formal) on first contact. Move to **«ты»** only if the owner
  initiates it.
- Short. Under 60 words. Every sentence about *their* problem, not Jaqyn's
  features.
- No links in the first message — links trigger spam filters and feel automated.
- Always a specific ask with a time window: «удобно завтра?» not «напишите мне».

---

### (a) Instagram DM sequence

**Touch 1 — Cold DM (Day 1)**

*After following the account and liking 2–3 posts.*

> **Russian:**
> Добрый день! Видел ваш [упомянуть конкретный пост — новое меню / интерьер / сезонный напиток] — очень красиво.
>
> Я Abdulrahman, делаю Jaqyn — помогаю кофейням Бишкека возвращать гостей и
> делать так, чтобы постоянные клиенты приводили друзей. Всё через телефон,
> без оборудования.
>
> Можно показать одну вещь за 15 минут — удобно на этой неделе?

> **English:**
> Good day! Saw your [reference specific post — new menu / interior / seasonal drink] — really beautiful.
>
> I'm Abdulrahman, I make Jaqyn — helping Bishkek cafés bring guests back and
> have regulars bring their friends. All on the phone, no equipment.
>
> May I show you one thing in 15 minutes — is this week convenient?

---

**Touch 2 — Follow-up (Day 5, if no reply)**

> **Russian:**
> Здравствуйте! Я писал несколько дней назад насчёт лояльности для кофейни.
>
> Если встреча не удобна — могу прислать короткое видео (2 минуты), как
> кофейня запускает акцию «приведи друзей» прямо со своего телефона. Без
> регистрации и оборудования.
>
> Отправить?

> **English:**
> Hello! I wrote a few days ago about loyalty for your café.
>
> If a meeting isn't convenient — I can send a short video (2 minutes) of how
> a café launches a "bring your friends" deal right from their phone. No
> registration or equipment.
>
> Shall I send it?

---

**Touch 3 — Final follow-up (Day 12, if no reply)**

> **Russian:**
> Последнее сообщение с моей стороны.
>
> У нас осталось 22 места из 25 для кофеен-основателей — они фиксируют цену
> 690 сом в месяц на целый год. После заполнения цена вырастет.
>
> Если когда-нибудь будет интересно — jaqyn.kg. Успехов вам!

> **English:**
> Last message from me.
>
> We have 22 of 25 spots left for founding cafés — they lock in 690 som/month
> for a full year. When it fills, the price goes up.
>
> If you're ever curious — jaqyn.kg. Good luck!

*After touch 3 with no reply: mark "No reply" in the pipeline, move on.
Do not send a 4th message. You can revisit in 6 weeks if something changes
(they post about a competitor opening, a slow season post, a loyalty question).*

---

### (b) WhatsApp / Telegram message sequence

*Preferred channel for 2GIS-sourced leads that list a phone number. WhatsApp
voice messages (≤ 60 seconds) get higher open rates than text in KG. If you
send text, keep it to 3 sentences.*

**Touch 1 — Cold message (Day 1)**

> **Russian (text version):**
> Добрый день! Меня зовут Abdulrahman. Я делаю Jaqyn — штамп-карты и акции
> «приведи друзей» для кофеен Бишкека, всё с телефона, без кассового
> оборудования.
>
> Хочу показать вам одну вещь — займет 15 минут. Удобно завтра или послезавтра?

> **English:**
> Good day! My name is Abdulrahman. I make Jaqyn — stamp cards and "bring your
> friends" deals for Bishkek cafés, all from the phone, without POS equipment.
>
> I want to show you one thing — takes 15 minutes. Is tomorrow or the day
> after convenient?

*Voice message script (read naturally, ~40 seconds):*
> «Добрый день, [имя, если известно]! Меня зовут Abdulrahman, я из Бишкека.
> Делаю сервис для кофеен — называется Jaqyn. Он заменяет бумажные
> штамп-карты и позволяет запускать акции "приведи двух друзей" прямо
> в WhatsApp. Ничего устанавливать не нужно — всё с телефона.
> Хочу показать вам за 15 минут. Удобно встретиться на этой неделе
> или созвониться?»

---

**Touch 2 — Follow-up (Day 6, if no reply)**

> **Russian:**
> Здравствуйте! Я писал в [день] насчёт программы лояльности для вашей кофейни.
>
> Понимаю, что времени мало. Могу прислать 2-минутное видео — покажу, как
> выглядит акция «приведи друзей» глазами вашего гостя. Без встречи.
>
> Хотите?

> **English:**
> Hello! I wrote on [day] about a loyalty programme for your café.
>
> I understand time is short. I can send a 2-minute video — showing how the
> "bring your friends" deal looks through your guest's eyes. No meeting needed.
>
> Want it?

---

**Touch 3 — Final follow-up (Day 14, if no reply)**

> **Russian:**
> Последнее сообщение — не хочу быть навязчивым.
>
> У нас программа для первых 25 кофеен-основателей: фиксируем цену в
> 690 сом/мес на год. Осталось 22 места.
>
> Если будет интересно — напишите в любое время. jaqyn.kg

> **English:**
> Last message — don't want to be pushy.
>
> We have a program for the first 25 founding cafés: lock in 690 som/month
> for a year. 22 spots left.
>
> If you're ever interested — write any time. jaqyn.kg

---

### (c) Walk-in script

*Use when walking into a café you identified from the 2GIS DB or the map.
Go during off-peak hours (10:00–11:30 or 14:00–16:00). Have a coffee first
— you are a customer before you are a salesperson.*

**At the counter (to the barista / staff):**

> **Russian:**
> Добрый день! Хотел бы поговорить с хозяином или управляющим по короткому
> делу — это займет 2 минуты. Он (она) сейчас здесь?

> **English:**
> Good day! I'd like to speak with the owner or manager about a brief matter —
> it will take 2 minutes. Are they here right now?

*If they say "yes, just a moment":* stand aside, don't block the counter.

*If they say "no, come back at [time]":*

> **Russian:**
> Спасибо! Я загляну [повторить их время]. Могу оставить номер для хозяина?

> **English:**
> Thank you! I'll stop by [repeat their time]. May I leave a number for the owner?

---

**When you meet the owner (first 30 seconds):**

> **Russian:**
> Добрый день! Меня зовут Abdulrahman. Я из Бишкека, делаю Jaqyn —
> это цифровые штамп-карты и акции «приведи друзей» для кофеен, всё через
> телефон. Хочу показать вам одну вещь на 15 минут — прямо сейчас или
> договоримся на удобное время?

> **English:**
> Good day! My name is Abdulrahman. I'm from Bishkek, I make Jaqyn —
> digital stamp cards and "bring your friends" campaigns for cafés, all on
> the phone. I want to show you one thing for 15 minutes — right now or
> shall we agree on a convenient time?

**What to have ready:**
- Your phone with the demo account open (pre-loaded café, group campaign,
  fake scan history).
- The 1-page Russian-language pitch PDF — leave it even if they say "not now."
- QR code on a business card linking to jaqyn.kg.

**If they say "not now, I'm busy":**

> **Russian:**
> Понимаю — не буду мешать. Могу оставить листовку и написать вам в
> WhatsApp с коротким видео. Как вас зовут?

> **English:**
> Understood — I won't hold you. May I leave a flyer and send you a short
> video on WhatsApp? What's your name?

*Getting their name converts a walk-in into a named prospect. Now the
follow-up WhatsApp/Telegram sequence begins.*

---

## 4. Demo / Pitch Structure

### Before the demo: discovery questions

Ask these **before** opening the laptop or phone. Listen for the pain that
matches. Demo to that pain, not to the feature list.

> 1. «Как у вас сейчас работает с постоянными гостями — вы их как-то отслеживаете?»
>    ("How do you currently handle regulars — do you track them in any way?")
>    → Listen for: paper cards, notebook, "I know my regulars by face," nothing.
>
> 2. «Бывает, что тихие дни — например, вторник–среда — хотелось бы заполнить?»
>    ("Do you have quiet days — Tuesdays, Wednesdays — that you'd like to fill?")
>    → Listen for: yes → wedge the group campaign; no → focus on the retention mechanic.
>
> 3. «Вы пробовали что-то для лояльности раньше — приложение, карты, что-то ещё?»
>    ("Have you tried anything for loyalty before — an app, cards, anything?")
>    → Listen for: "tried UDS / Telegram bot, nobody used it" → address the fatigue
>    objection directly before it surfaces; "paper cards" → show measurement gap.
>
> 4. «Сколько у вас сотрудников на кассе / за баром?»
>    ("How many staff members do you have at the counter / bar?")
>    → If 1–2: show the 1-tap scan live. If 3+: address training briefly.

---

### The 15-minute demo flow

**Minute 0–2 — Frame the problem, not the product**

Summarize what you heard in discovery. Use their words:

> «Вы сказали, что гости приходят один раз и не возвращаются, и бумажные
> карты теряются. Вот что я хочу вам показать.»
>
> ("You said guests come once and don't return, and paper cards get lost.
> Here's what I want to show you.")

Do not say "Jaqyn is a loyalty platform." The product name comes later.

---

**Minute 2–5 — Wow moment 1: Staff scan (2 seconds)**

Open the staff scanner on your phone. Ask the owner (or a staff member) to
scan the demo QR code on a printed tent card or second phone.

> «Вот как это выглядит для сотрудника. Одна кнопка, один QR —
> и гость получил штамп. Звуковое подтверждение. Три секунды.»
>
> ("This is what it looks like for the staff member. One button, one QR —
> and the guest gets a stamp. Audio confirmation. Three seconds.")

Let them do the scan themselves. Hands-on > watching. The audio confirm
("дзынь") at successful scan is the moment that neutralizes "my staff won't
bother."

---

**Minute 5–9 — Wow moment 2: Group "bring friends" campaign**

Switch to the customer view. Show the group campaign interface: «Приведи 2
друзей в эту кофейню до воскресенья — вся группа получает бесплатный напиток».

> «Теперь гость нажимает вот сюда — и получает ссылку, которую можно
> отправить друзьям в WhatsApp или Telegram. Друзья приходят, все сканируют —
> и все получают награду. Ваш гость только что привёл вам двух новых
> посетителей, и это ничего вам не стоило по отдельности.»
>
> ("Now the guest taps here — and gets a link they can share with friends on
> WhatsApp or Telegram. Friends come in, everyone scans — and everyone gets
> a reward. Your guest just brought you two new visitors, and it cost you
> nothing per head.")

Ask: «Вот это — что вы думаете?» ("What do you think about this?")
Wait for the reaction. Don't fill the silence. If they lean in, the demo is
working.

---

**Minute 9–12 — Wow moment 3: Branded wallet card**

Show the customer wallet screen: the café's own logo, their accent color,
the stamp card with the owner's business name on it.

> «Вот что видит ваш гость в телефоне. Это ваша карточка, ваш бренд —
> не чужое приложение. Никуда не надо заходить — просто сканирует QR на
> столике и карточка уже там.»
>
> ("This is what your guest sees on their phone. This is your card, your
> brand — not someone else's app. No app to install — they just scan the QR
> on the table and the card is already there.")

Then show the owner dashboard: scan count, campaign joins, repeat visits.

> «А вот что вы видите. Через две недели вы точно знаете — сколько
> сканирований, сколько гостей присоединились к акции, сколько пришли снова.
> Не на ощущениях — цифры.»
>
> ("And here's what you see. After two weeks you know exactly — how many
> scans, how many guests joined the campaign, how many came back. Not a
> gut feeling — numbers.")

---

**Minute 12–15 — Close / ask for the next step**

> «Так выглядит 15 минут настройки — один раз, и всё работает.
> Тридцать дней пробного периода бесплатно. Я помогаю с настройкой лично —
> вместе, прямо здесь. Хотите попробуем прямо сейчас?»
>
> ("That's what 15 minutes of setup looks like — once, and it all works.
> Thirty days free trial. I help with setup personally — together, right here.
> Want to try right now?")

If they are not ready to start immediately: «Когда удобно встретиться на
30 минут, чтобы всё настроить?» ("When can we meet for 30 minutes to set
everything up?") Get a specific date and time. Do not leave without a date.

---

### Demo assets required

- [ ] **Demo café account** pre-loaded: realistic café name + logo, 1 group
      campaign ("Приведи 2 друзей до воскресенья"), 1 stamp-card program,
      10–15 fake scans, 2 completed campaign groups. This is the
      "show, don't tell" engine. Build it once; reuse forever.
- [ ] **Printed QR tent card** (demo version) for the owner to physically
      scan at the counter.
- [ ] **1-page pitch PDF (A4, Russian):** one sentence, 3 proof points,
      dashboard screenshot, founding price, QR to jaqyn.kg. Print 30 copies.

---

## 5. Objection Handling

**Ground rule:** never argue. Validate the concern, give the honest answer,
move on. Never claim something the product can't do.

---

**Objection 1: «Мои клиенты уже получают кэшбэк от МБанка — зачем им ещё?»**
("My customers already get cashback from MBank — why do they need this?")

> МБанк строит лояльность к МБанку. Jaqyn строит лояльность к вашей кофейне.
> У гостя не будет "бесплатный кофе в [ваше название]" нигде в мобильном
> банке — только ваш кэшбэк на счёт в банк. Механика "каждый 6-й бесплатно"
> — это другая привычка, она сильнее, чем 3% назад. И главное: у МБанка нет
> акции "приведи друзей" — они не привлекают вам новых гостей.
>
> (MBank builds loyalty to MBank. Jaqyn builds loyalty to your café.
> A guest won't find "free coffee at [your name]" anywhere in their banking
> app — only your cashback into the bank. The "every 6th free" mechanic is
> a different habit; it's stronger than 3% back. And the key point: MBank
> has no "bring your friends" campaign — they don't bring you new guests.)

---

**Objection 2: «Я уже пробовал программу лояльности — никто не пользовался.»**
("I already tried a loyalty app — nobody used it.")

> Понимаю — это самое частое, что я слышу. В большинстве приложений лояльность
> живёт внутри чужого приложения, которое гость должен помнить открыть. Здесь
> другая механика: гость сканирует QR прямо у вас на столике — карточка
> появляется мгновенно, без скачивания. И вот что важно: вы видите аналитику
> в дашборде уже через 2 недели. Если никто не заходит — вы это увидите и
> сможете изменить. Вы не узнаете это через ощущения — вы узнаете через цифры.
>
> (I understand — that's the most common thing I hear. In most apps, loyalty
> lives inside someone else's app the guest has to remember to open. The
> mechanic here is different: the guest scans a QR right on your table — the
> card appears instantly, no download. And the key thing: you see analytics
> in the dashboard in just 2 weeks. If nobody is joining — you'll see that
> and can change something. You won't find out through gut feeling — you'll
> find out through numbers.)

---

**Objection 3: «Мои сотрудники не будут сканировать — им некогда.»**
("My staff won't scan — they don't have time.")

> Покажу — буквально 3 секунды. [Открываете демо.] Одна кнопка, QR, звук.
> Не нужен POS, не нужны коды. Быстрее, чем принять наличные. Первую неделю
> я лично прихожу и показываю одному сотруднику — это занимает 5 минут.
> После этого они учат друг друга.
>
> (Let me show you — literally 3 seconds. [Open demo.] One button, QR, sound.
> No POS needed, no codes. Faster than accepting cash. The first week I come
> personally and show one staff member — takes 5 minutes. After that they
> teach each other.)

---

**Objection 4: «Клиенты не будут регистрироваться на сайте ради кофейни.»**
("Customers won't register on a website for a coffee shop.")

> Устанавливать ничего не нужно. Гость сканирует QR-код на столике —
> открывается страница с вашей карточкой. Вводит email или телефон — всё.
> Это один экран, 20 секунд. Нет «скачать приложение», нет App Store.
> Многие кофейни уже просят гостей сканировать QR для меню — это тот
> же жест.
>
> (Nothing to install. The guest scans a QR code on the table — a page
> opens with your card. They enter their email or phone — done. One screen,
> 20 seconds. No "download an app," no App Store. Many cafés already ask
> guests to scan QR codes for menus — it's the same gesture.)

---

**Objection 5: «У меня уже есть бумажные штамп-карты — зачем менять?»**
("I already have paper stamp cards — why change?")

> Бумажные карты хороши для одного: гость понимает механику.
> Но: они теряются, их иногда дорисовывают, и главное — вы не знаете, кто
> ваш постоянный гость, сколько раз пришёл, что сработало. И акцию
> "приведи друзей" через бумажную карту не запустишь. Оба можно
> оставить параллельно первую неделю — пусть гости сами выберут.
>
> (Paper cards are good for one thing: the guest understands the mechanic.
> But: they get lost, they sometimes get extra stamps added, and most
> importantly — you don't know who your regular is, how many times they've
> come, what worked. And you can't run a "bring your friends" campaign via
> a paper card. You can run both in parallel the first week — let guests
> choose.)

---

**Objection 6: «Кто вы вообще такие? Я вас не знаю.»**
("Who are you anyway? I don't know you.")

> Меня зовут Abdulrahman, я из Бишкека. Jaqyn — это моя компания, я её
> основатель. Мы работаем с кофейнями Бишкека уже [N месяцев]. Вот несколько
> кафе, с которыми мы работаем сейчас: [назвать 1–2 реальных, как только
> они появятся]. Я понимаю, что первый звонок — это доверие. Именно поэтому
> я предлагаю пробный период бесплатно: вы ничего не платите, пока не
> убедитесь, что это работает.
>
> (My name is Abdulrahman, I'm from Bishkek. Jaqyn is my company, I'm the
> founder. We've been working with Bishkek cafés for [N months]. Here are a
> few cafés we work with now: [name 1–2 real ones once they exist]. I
> understand that the first call is about trust. That's why I offer a free
> trial: you don't pay anything until you've seen it works.)

*Note: until you have real café customers, say «мы на этапе запуска и работаем
с первыми кофейнями» ("we are at launch stage and working with the first
cafés"). Do not claim customers you don't have.*

---

**Objection 7: «У меня маржа маленькая — я не могу раздавать кофе бесплатно.»**
("My margins are thin — I can't give away free coffee.")

> Вы сами настраиваете условия: после какого количества штампов награда, какая
> награда, лимиты, срок действия. Если вам комфортно давать бесплатный напиток
> после 10 визитов — ставьте 10. Если только скидку 20% — только скидку. Кэшбэк
> в процентах тоже можно ограничить сверху. Ни одна акция не выходит за рамки,
> которые вы задали сами. Я помогу подобрать параметры, которые не бьют по марже.
>
> (You configure the terms yourself: after how many stamps is a reward, what
> the reward is, caps, expiry. If you're comfortable giving a free drink after
> 10 visits — set it to 10. If only a 20% discount — just a discount. Cashback
> as a percentage can also be capped. No campaign exceeds the limits you set
> yourself. I'll help choose parameters that don't hurt your margin.)

---

**Objection 8: «Дайте мне подумать.»**
("Let me think about it.")

> Конечно. Хочу только сказать одно: мы сейчас открываем программу для
> первых 25 кофеен-основателей — 690 сом в месяц на год. После заполнения
> цена станет 990. Осталось [N] мест.
>
> Чтобы не занимать ваше время: что именно вас останавливает? Может, я
> отвечу прямо сейчас.
>
> (Of course. I just want to say one thing: we're currently opening the
> program for the first 25 founding cafés — 690 som/month for a year. After
> it fills, the price becomes 990. [N] spots left.
>
> So I don't take up your time: what exactly is holding you back? Maybe I
> can answer it right now.)

*If they still need time: «Когда вам удобно поговорить коротко — завтра
или послезавтра?» ("When is it convenient to talk briefly — tomorrow or
the day after?") Get a specific call-back time. Put it in the pipeline
as "Follow-up scheduled." Do not leave it as "thinking."*

---

## 6. Closing and Onboarding

### How to ask for the sale

Ask clearly. One time. Do not hint or circle around it.

**Standard close after the demo:**

> «Хотите начать? 30 дней бесплатно — я помогаю с настройкой прямо сейчас
> или в удобное для вас время. Потом, если понравится, платите 690 сом в месяц
> и фиксируете эту цену на год. Если нет — просто не продолжаем, и всё.»
>
> ("Want to start? 30 days free — I help with setup right now or at a
> convenient time for you. Then, if you like it, you pay 690 som/month and
> lock in this price for a year. If not — we just don't continue, and that's it.")

**Founding offer scarcity close (use when they are on the fence):**

> «У меня есть возможность зафиксировать для вас 690 сом на год — это
> программа первых 25 кофеен-основателей. Осталось [N] мест. Если вы занимаете
> место сейчас — оно ваше. Когда места закончатся, цена будет 990. Хотите
> занять место?»
>
> ("I can lock in 690 som for a year for you — this is the first-25-founding-
> cafés program. [N] spots left. If you take a spot now — it's yours. When
> the spots are gone, the price goes to 990. Do you want to take a spot?")

*The scarcity is real: 25 businesses only, through 2026-10-31. Never claim
fewer spots than actually remain — owners will compare notes.*

---

### Pilot structure

**Duration:** 30 days. Café visit frequency makes the loyalty habit visible
inside 30 days — a stamp card fills, a group campaign completes.

**Success criteria — agree on these at the start of the pilot, not after:**

Say this at onboarding:

> «Через 30 дней посмотрим на три цифры вместе: количество сканирований,
> сколько гостей присоединились к акции "приведи друзей", и сколько пришли
> снова после первого визита. Если эти цифры вас устраивают — оформляем
> подписку. Договорились?»
>
> ("In 30 days we'll look at three numbers together: number of scans, how
> many guests joined the 'bring your friends' campaign, and how many came
> back after the first visit. If these numbers satisfy you — we set up the
> subscription. Agreed?")

Write the three numbers in your own notes and the pipeline tracker. This
converts an open-ended "trial" into a decision gate the owner has already
agreed to.

**Minimum success bar for conversion (suggested — adjust to their context):**

| Metric | Threshold for a café doing ~30–80 covers/day |
|---|---|
| Total scans | ≥ 40 over 30 days |
| Group campaign joins | ≥ 5 groups completed (meaning ≥ 10 new guest visits via the campaign) |
| Repeat visitors (≥ 2 scans same customer) | ≥ 10 customers |

If they hit these numbers, the product is working. Show the dashboard at
day 21 (not day 30 — gives you 9 days to course-correct before the trial ends
if numbers are low).

---

### Founder-assisted onboarding session (~45 minutes, on-site)

**This happens at the start of the 30-day trial, immediately after the demo
converts.** Do not leave it for "later this week." The longer the gap between
"yes" and first scan, the more likely the owner forgets, deprioritizes, or
never starts.

**Onboarding checklist (run through in order):**

1. **Business profile setup (10 min)**
   - Name, logo, brand color (used for the wallet card — `Business.card_accent`)
   - Public profile page URL
   - Owner's contact / Instagram for the public listing
   - Complete the profile together; do not ask the owner to do it alone later.

2. **First loyalty program (5 min)**
   - Stamp card: "every Nth coffee free" — let the owner decide N
   - Or points-cashback: "X% on every purchase" if they prefer cashback framing
   - Keep it simple for month one. One program only.

3. **First group campaign (10 min)**
   - «Приведи [2/3] друзей в [название кофейни] до [дата +14 дней] —
     вся группа получает [конкретную награду]»
   - Date window: 10–14 days from now (short enough to create urgency)
   - Reward: free drink, free upgrade, or 20% discount — owner's choice
   - Show the owner the invite link WhatsApp/Telegram share button
   - Ask the owner to share the link in their own Instagram Stories right now,
     while you're there.

4. **Staff scan training (10 min)**
   - Add 1–2 staff members as scanner accounts
   - Show the scan flow on their phone — let them scan you once
   - Explain: "One QR, one tap, audio confirm. If the sound plays, it worked."
   - Set the rule: every guest at the counter gets asked once: «У вас есть
     наша карточка лояльности?» ("Do you have our loyalty card?")

5. **QR table tent (5 min)**
   - Print 3–5 A5 tent cards at a local print shop (you provide the PDF template)
   - Place one at every table and one at the counter
   - Cost to the café: ~150–300 KGS at a local Bishkek print shop
   - Alternative: print them for the first 5 founding cafés yourself as a
     gesture — ~600–1,000 KGS total, high trust signal.

6. **Day-21 check-in appointment (5 min)**
   - Book it before you leave: «Давайте созвонимся через 3 недели —
     посмотрим на цифры вместе. Удобно [конкретный день]?»
   - Add it to both calendars.

---

### Day-21 check-in and conversion

Pull up the dashboard together (over video call or in person).

> «Смотрите — вот ваши цифры за 3 недели: [X] сканирований, [Y] групп
> завершено, [Z] гостей пришли снова. [Если хорошие:] Это хороший результат.
> Вы входите в первые 25 кофеен — могу зафиксировать 690 сом в месяц на год.
> Хотите оформить?»
>
> ("Look — here are your numbers for 3 weeks: [X] scans, [Y] groups
> completed, [Z] guests came back. [If good:] That's a good result.
> You're in the first 25 cafés — I can lock in 690 som/month for a year.
> Want to set it up?")

**If numbers are low (< threshold):** diagnose together, don't run from it.

> «Цифры пока скромные. Давайте разберёмся вместе: сотрудники спрашивают
> гостей про карточку? Акция "приведи друзей" была расшарена? Если нет —
> попробуем одно изменение: [конкретное действие]. Дадим ещё 1–2 недели?»
>
> ("Numbers are modest so far. Let's figure it out together: are staff
> asking guests about the card? Was the 'bring friends' campaign shared?
> If not — let's try one change: [specific action]. Give it 1–2 more weeks?")

**Manual invoicing (when they say yes):**

Issue a счёт (invoice) for month 1. Key fields:
- Your legal entity name, tax ID (ИНН/ПИН), bank details
- Business name and contact
- Service: «Подписка Jaqyn — план [Растём/Бизнес], [месяц] 2026»
- Amount: 690 KGS (founding rate, Grow) or 1,490 KGS (Business)
- Payment method: bank transfer (ELQR / MBank transfer / cash if convenient)

Toggle the subscription active in the Django admin once payment is confirmed.

*Until billing code ships, all of this is manual. That is fine for 25 businesses.
It is not fine for 100. The billing P0 checklist (`03-pricing.md` §7) is the gate
to self-serve.*

---

## 7. Pipeline Tracking

**Philosophy:** use the simplest tool that covers the whole funnel. A Google
Sheet or Notion table is fine. The Django admin leads table (`apps/leads`) can
serve as the source-of-truth list for the 120-lead DB if you add status columns.
The key is that it's **updated every Wednesday** without thinking about it.

---

### Pipeline stages and definitions

| Stage | Definition | What to record |
|---|---|---|
| **Lead** | In the 2GIS DB or discovered via Instagram/walk-in; not yet contacted | Name, location, Instagram handle, phone/WhatsApp, source |
| **Contacted** | First DM/message/walk-in sent; waiting for reply | Date of first contact, channel used, specific note from their account |
| **Replied** | Responded with any message (even "not now") | Date of reply, what they said, next action |
| **Demo booked** | Specific date and time agreed | Demo date, format (in-person / video) |
| **Demo done** | Demo completed | Outcome: hot (ready now), warm (wants to think), cold (not interested) |
| **Trial active** | Onboarded; first scan made; 30-day clock running | Onboarding date, trial end date, day-21 check-in date |
| **Paying** | Invoice issued and paid; subscription active | Plan (Grow/Business), founding rate Y/N, monthly amount, payment date |
| **No reply** | Sent touch 3; no response in 14 days | Date last contacted; mark for 6-week re-touch |
| **Not now** | Explicitly declined but not hostile ("try me in 3 months") | Reason, date to re-contact |
| **Churned** | Was paying, stopped | Month churned, stated reason |

---

### What to record per prospect (minimum viable CRM)

| Field | Why it matters |
|---|---|
| Business name + Instagram handle | Cross-reference for pre-warm; link to their profile |
| Owner first name | Personalization in every message |
| Contact channel (WhatsApp / Instagram / walk-in) | Match follow-up to where they responded |
| Date first contact | Track days-since to know when to follow up |
| Stage | See table above |
| Demo date | Don't miss it; add to calendar |
| Notes (1–2 sentences) | Specific thing from their account; objection raised; personal detail they shared |
| Founding rate locked? (Y/N) | Track the 25-seat cap |
| Trial end date | Know when the day-21 check-in falls |
| Invoice issued (Y/N) + date | Manual billing tracker |

---

### Weekly pipeline hygiene (5 minutes, every Wednesday)

1. Move every contact that replied since Monday to "Replied."
2. Move every contact stuck in "Contacted" for > 7 days: send touch 2
   if not sent; send touch 3 if touch 2 already sent; mark "No reply"
   if touch 3 sent and no response.
3. Check trial-active businesses for their day-21 check-in date — is it
   this week? Book it.
4. Check "paying" businesses — any invoice outstanding > 7 days? Follow up.
5. Scan "Not now" column — any with a re-contact date in the next 14 days?
   Move them back to "Lead."

---

### Target pipeline metrics (monthly review)

| Metric | Target (months 1–3) |
|---|---|
| Contacts/week | 5 |
| DM → reply rate | ≥ 20% (1 in 5) |
| Reply → demo rate | ≥ 50% (1 in 2 replies) |
| Demo → trial rate | ≥ 60% (3 in 5 demos) |
| Trial → paying rate | ≥ 60% |
| End-to-end: contact → paying | ≈ 4–6 weeks |

*If DM → reply rate is < 20%: the opening message is wrong — vary the hook.
If demo → trial rate is < 60%: the demo is not landing — diagnose the
objection heard most and adjust section 4 above.
If trial → paying rate is < 60%: the day-21 check-in is the fix — are you
doing it? Is the owner seeing their own data?*

---

## 8. Weekly Sales Cadence

**Budget: 10 hours/week alongside coding. Split approximately 60/40 between
active selling and supporting live customers.**

This schedule integrates with and extends `04-marketing-strategy.md` §6 —
that doc covers the marketing rhythm (Instagram, Telegram, content);
this section covers the direct sales rhythm layered on top.

---

### Monday — 90 minutes

**:30 — Numbers review (30 min)**
- Pull the dashboard for every trial-active café: scans this week, campaign
  joins, repeat visits. Note any café where scans dropped week-over-week
  (churn signal — call them Thursday).
- Update the pipeline spreadsheet: move anything that changed since Friday.
- Instagram: publish this week's pre-drafted post (per marketing doc).

**:60 — Outreach prep (30 min)**
- Pull 5 new prospects from the leads DB for this week.
- Check each one's Instagram: last post, follower count, any recent
  "customer" content. Write one specific note per prospect.

**:90 — Content / material (30 min)**
- If you owe a follow-up from last week (a prospect asked for a video,
  a PDF, etc.), send it now.
- Or: draft next week's Instagram post if Monday is light.

---

### Wednesday — 90 minutes

**:60 — Outreach execution (60 min)**
- Send 5 cold DMs/WhatsApp messages using this week's prospect list.
  Personalize with the Monday notes. Log each in the pipeline.
- Send follow-ups to anyone stuck in "Contacted" or "Replied":
  touch 2 if 5–7 days since touch 1; touch 3 if 10–14 days since touch 2.
- Reply to any incoming messages from prospects.

**:30 — Telegram community (30 min)** (per marketing doc §2 Channel 3)
- Scan 3–4 groups. Write one helpful reply if relevant. DM anyone who
  posted about loyalty/retention pain.

---

### Thursday — 30 minutes (light day, but do not skip)

**:30 — Relationship calls (30 min)**
- Voice message or call to one live founding café: «Как дела? Всё работает?»
  Not a sales call. Catch friction early.
- If you noticed a scan-count drop on Monday: call that café today.
- If a prospect replied "not now" earlier this week: send a low-friction
  follow-up: «Понял, не вопрос. Если что-то изменится — вот мой Telegram.»

---

### Friday — 60 minutes

**:20 — Weekly pipeline review**
- Count: contacts sent this week, replies received, demos booked, trials
  started, conversions. Log against the targets in §7.
- If DM → reply < 20%: tweak the opening line for next week.
- If demo → trial < 60%: identify which objection came up most; adjust
  the demo script.

**:20 — Content draft**
- Write or outline next Monday's Instagram post from the 10-piece content
  plan (`04-marketing-strategy.md` §3).

**:20 — Demo prep (if a demo is booked for next week)**
- Refresh the demo café account if needed.
- Confirm time with the prospect the day before.

---

### As-needed (not weekly, but block time when they happen)

| Event | Time block |
|---|---|
| 15-minute live demo | 30 min total (15 demo + 15 travel or setup) |
| 45-minute onboarding session | 60 min (45 session + 15 travel/prep) |
| Day-21 check-in call | 30 min |
| Monthly invoice batch | 30 min (issue invoices for all businesses entering month 2) |
| Monthly pipeline review | 60 min (first Friday of month) |

---

### 10-hour/week time budget breakdown

| Activity | Weekly hours |
|---|---|
| Outreach (prep + execution + follow-ups) | ~3.0 hrs |
| Live demos (as booked — target 1–2/week) | ~1.5 hrs |
| Onboarding sessions (as booked — 1 every 1–2 weeks) | ~0.75 hrs |
| Relationship calls (live cafés) | ~0.5 hrs |
| Pipeline review + admin (Mon/Wed/Fri) | ~1.0 hr |
| Day-21 check-ins | ~0.5 hrs |
| Instagram (post + DMs) | ~1.0 hr |
| Telegram community | ~0.5 hrs |
| Demo prep / materials | ~0.25 hrs |
| **Total** | **~9 hrs** |

*This leaves ~1 hour/week buffer for unexpected conversations, referral calls,
or a second demo. If coding and sales are competing, protect Tuesday morning
and Thursday afternoon for uninterrupted coding blocks. Do not let sales
bleed into those slots.*

---

### Ramp expectations

**Weeks 1–4:** mostly outreach + 1–2 demos. Few or no live customers.
Sales feels slow. This is normal — you are building the first layer of the
funnel. Do not skip the Telegram and Instagram work; it warms the next
batch of prospects.

**Weeks 5–8:** first businesses live and scanning. The day-21 check-in
conversations are the highest-value hour of your week. Real data from real
cafés is now the demo's strongest asset.

**Weeks 9–12:** founding customers start converting to paid. Referral asks
begin. If 1–2 founders share Jaqyn in their Telegram groups, inbound
inquiries start arriving — these close faster than cold DMs.

**Month 3+:** if the playbook is converting (8+ paying cafés), open the
referral program formally, begin coffee-supplier partnership conversations,
consider a Bishkek café/barista event. Shift from pure outbound to a mix of
outbound + inbound + referral.

---

## Appendix — Quick Reference

### Founding program facts (use in every closing conversation)

- First **25 businesses** OR all signed by **2026-10-31** (whichever first)
- Grow plan: **690 KGS/mo** (vs. 990 KGS standard) — locked for **12 months**
- Business plan: **1,490 KGS/mo** (vs. 1,990 KGS standard) — locked for **12 months**
- Payment: manual invoice (bank transfer / ELQR / cash equivalent)
- In exchange: a testimonial conversation (no obligation to publish)

### Best opening line (Russian — use in first DM/walk-in)

> «Хочу показать вам одну вещь за 15 минут — как ваши постоянные гости
> начинают приводить друзей сами, через WhatsApp.»
>
> ("I want to show you one thing in 15 minutes — how your regulars start
> bringing their friends themselves, via WhatsApp.")

### The three wow moments (demo core — never skip these)

1. Staff scan: one tap, audio confirm, 3 seconds
2. Group campaign invite link shared in WhatsApp
3. Branded wallet card: the café's own logo and colors, no app install

### Top objection + answer (short form)

**«Пробовал — никто не пользовался.»**
→ «Здесь аналитика: через 2 недели видите цифры — работает или нет.
Не ощущения — цифры. И акция "приведи друзей" — это не то, что в
тех приложениях было.»

("Tried it — nobody used it."
→ "Here there's analytics: in 2 weeks you see the numbers — is it working
or not. Not feelings — numbers. And the 'bring your friends' campaign —
that's not what those other apps had.")
