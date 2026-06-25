// Raw translation strings per language. Brand/proper nouns (Manas Coffee, etc.)
// and pure numbers live in content.ts as static data — only translatable text is here.

export interface StepText { title: string; text: string; }
export interface MiniDealText { deal: string; tag: string; }
export interface DealText { cat: string; badge: string; offer: string; window: string; }
export interface WidgetText { label: string; delta: string; }
export interface GroupRowText { name: string; when: string; status: string; }
export interface FaqText { q: string; a: string; }

export interface Dict {
  nav: string[]; // 5
  header: { explore: string; register: string; login: string };
  hero: {
    badge: string;
    title: { lead: string; highlight: string; trail: string };
    subtitle: string;
    ctaPrimary: string;
    ctaSecondary: string;
    betterTitle: string;
    betterSub: string;
    phone: {
      tag: string; offer: string; sub: string; forming: string; invite: string;
      scan: string; rewardUnlocked: string; rewardReady: string; friendsJoined: string;
    };
  };
  how: { eyebrow: string; heading: string; steps: StepText[] }; // 4
  customers: { eyebrow: string; heading: string; benefits: StepText[]; nearby: string; find: string; deals: MiniDealText[] };
  business: { eyebrow: string; heading: string; para: string; benefits: StepText[]; cta: string };
  deals: { eyebrow: string; heading: string; para: string; offers: DealText[] };
  qr: { eyebrow: string; heading: string; para: string; bullets: string[]; steps: string[] };
  example: {
    eyebrow: string; heading: string; para: string;
    bizLabel: string; bizText: string; custLabel: string; custText: string;
    live: string; cardTitle: string; cafes: string; mission: string; missionValue: string;
    progress: string; joined: string; rewardLabel: string; rewardText: string;
  };
  dashboard: {
    eyebrow: string; heading: string; para: string; ownerSub: string; arriving: string;
    widgets: WidgetText[]; weekly: string; days: string[]; active: string; groups: GroupRowText[];
  };
  trust: { eyebrow: string; heading: string; para: string; cards: string[] };
  faq: { eyebrow: string; heading: string; items: FaqText[] };
  form: {
    eyebrow: string; heading: string; para: string; perks: string[];
    successTitle: string; successText: string; submitAnother: string; requestTitle: string;
    labels: { business: string; owner: string; phone: string; email: string; category: string; area: string; instagram: string; optional: string };
    placeholders: { business: string; owner: string; phone: string; email: string; area: string; instagram: string };
    categories: string[]; // 8, indexed to categoryValues
    submit: string; submitting: string; errorText: string; validationErrorText: string;
  };
  finalCta: { heading: string; para: string; register: string; explore: string };
  footer: {
    tagline: string; colTitles: string[]; productLinks: string[]; businessLinks: string[];
    legal: string; privacy: string; terms: string;
  };
  mobile: { explore: string; register: string };
}

export const en: Dict = {
  nav: ['How it works', 'For customers', 'For businesses', 'Group deals', 'FAQ'],
  header: { explore: 'Explore Deals', register: 'Register Business', login: 'Log in' },
  hero: {
    badge: 'Now piloting with local spots in Bishkek',
    title: { lead: 'Loyalty rewards from the local spots you ', highlight: 'love', trail: '.' },
    subtitle:
      'Collect stamps, unlock vouchers, and join campaigns and group deals from local cafes, salons, barbers, and shops — all from one QR profile. No app download required.',
    ctaPrimary: 'Explore nearby rewards →',
    ctaSecondary: 'Register Your Business',
    betterTitle: 'Better together.',
    betterSub: 'Rewards unlock when your group shows up.',
    phone: {
      tag: 'Group deal · Cafe',
      offer: 'Free dessert for the whole table',
      sub: 'Come as 5 between 14:00–17:00 today.',
      forming: 'Group forming',
      invite: 'Invite 1 more friend',
      scan: 'Scan to join',
      rewardUnlocked: 'Reward unlocked',
      rewardReady: 'Free dessert · ready',
      friendsJoined: 'Friends joined',
    },
  },
  how: {
    eyebrow: 'How it works',
    heading: 'Four steps to your first reward',
    steps: [
      { title: 'Find a local spot', text: 'Discover nearby cafes, salons, barbers, and shops and the rewards they offer.' },
      { title: 'Show your QR', text: 'Staff scan your personal QR on each visit — no codes to type, no app to install.' },
      { title: 'Collect progress', text: 'Earn stamps and progress toward rewards, campaigns, and group deals.' },
      { title: 'Unlock & redeem', text: 'Hit the goal and a voucher lands in your wallet, ready to redeem.' },
    ],
  },
  customers: {
    eyebrow: 'For customers',
    heading: 'Everything you earn, in one rewards wallet',
    benefits: [
      { title: 'Rewards wallet', text: 'Collect stamps and vouchers across local spots and redeem them in a tap.' },
      { title: 'Campaigns & group deals', text: 'Join visit, time-window, and group campaigns to earn even more.' },
      { title: 'Local discovery', text: 'Find nearby cafes, restaurants, salons, barbers, and shops on the map.' },
      { title: 'One QR profile', text: 'Collect everywhere without a separate app for each place.' },
    ],
    nearby: 'Nearby deals',
    find: 'Find a group deal',
    deals: [
      { deal: 'Free dessert ×5', tag: 'Group' },
      { deal: '20% off for two', tag: '2+' },
      { deal: 'Free appetizer', tag: '4+' },
    ],
  },
  business: {
    eyebrow: 'For businesses',
    heading: 'Loyalty, campaigns, and reports in one dashboard',
    para:
      'Run stamp cards and voucher rewards, launch visit, time-window, and group campaigns, and see what actually brings customers back — all from one simple dashboard. No custom app required.',
    benefits: [
      { title: 'Loyalty programs', text: 'Stamp, visit, and spend rewards that mint vouchers automatically.' },
      { title: 'Campaigns & group deals', text: 'Visit, time-window, and group offers to fill your slow hours.' },
      { title: 'No custom app', text: 'QR codes, a staff scan app, and a simple web dashboard.' },
      { title: 'Reports that matter', text: 'Scans, returning customers, redemptions, retention, and staff performance.' },
    ],
    cta: 'Register Your Business →',
  },
  deals: {
    eyebrow: 'Group deals',
    heading: 'Turn friends into foot traffic',
    para:
      'Businesses post offers like “come as 5 and get a free dessert.” Customers form a group, invite friends, and unlock the reward only when everyone actually arrives.',
    offers: [
      { cat: 'Cafe', badge: 'Group ×5', offer: 'Come as 5 between 14:00–17:00 and get a free dessert for the table.', window: 'Today' },
      { cat: 'Barber', badge: 'Bring 3', offer: 'Bring 3 friends this week and everyone gets 15% off the cut.', window: 'This week' },
      { cat: 'Salon', badge: 'Book ×2', offer: 'Book with a friend and both get 20% off selected services.', window: 'Mon–Thu' },
      { cat: 'Restaurant', badge: 'Group 4+', offer: 'A group of 4 or more gets a free appetizer for the table.', window: 'Daily' },
    ],
  },
  qr: {
    eyebrow: 'QR loyalty',
    heading: 'Simple QR rewards for every business',
    para:
      'Customers show their personal QR; staff scan it to add a visit and apply rewards in one tap — no codes to type. Run stamp cards, vouchers, and campaigns from one dashboard.',
    bullets: ['Show your QR', 'Staff scans it', 'Visit counted', 'Reward progress', 'Voucher unlocked', 'Business reports'],
    steps: ['Show your QR', 'Staff scans', 'Collect stamp', 'Unlock reward'],
  },
  example: {
    eyebrow: 'Example campaign',
    heading: 'Bishkek Coffee Crew Pass',
    para:
      'Participating cafes offer group rewards during slow afternoon hours. Customers form groups, invite friends, visit together, and unlock shared rewards.',
    bizLabel: 'The business value:',
    bizText: 'the merchant gives a reward only when the group actually shows up.',
    custLabel: 'The customer value:',
    custText: 'a reason to go out together and discover new local places.',
    live: 'Live · Today 14:00–18:00',
    cardTitle: 'Coffee Crew Pass',
    cafes: 'Cafes',
    mission: 'Mission',
    missionValue: 'Visit ×5',
    progress: 'Group progress',
    joined: '3 / 5 joined',
    rewardLabel: 'Reward:',
    rewardText: 'Free dessert / discount for the table',
  },
  dashboard: {
    eyebrow: 'Business dashboard',
    heading: 'Everything a business needs to run offers',
    para:
      'Create offers, manage QR codes, verify groups, track rewards, and understand what actually brings customers back.',
    ownerSub: 'Owner dashboard · last 30 days',
    arriving: '3 groups arriving today',
    widgets: [
      { label: 'Total scans', delta: '+18% this month' },
      { label: 'New customers', delta: '+9% this month' },
      { label: 'Returning', delta: '+12% this month' },
      { label: 'Est. revenue', delta: 'som · last 30d' },
      { label: 'Active groups', delta: '6 forming now' },
      { label: 'Completed', delta: 'groups arrived' },
      { label: 'Redeemed', delta: 'rewards given' },
      { label: 'Scheduled', delta: 'arriving today' },
    ],
    weekly: 'Weekly scans',
    days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    active: 'Active groups',
    groups: [
      { name: '5 at Manas Coffee', when: 'Today · 15:00', status: 'Forming' },
      { name: '4 at Tanyr Grill', when: 'Today · 19:30', status: 'Confirmed' },
      { name: '3 at Lush Salon', when: 'Tomorrow · 12:00', status: 'Completed' },
    ],
  },
  trust: {
    eyebrow: 'Early access',
    heading: 'Built for local businesses in Bishkek',
    para:
      'Designed for small and mid-sized businesses that want simple, measurable promotions — without building their own app.',
    cards: [
      'No app download for customers',
      'Stamp cards + voucher wallet',
      'Visit, time-window & group campaigns',
      'QR visit scan — no codes',
      'Retention & staff reports',
    ],
  },
  faq: {
    eyebrow: 'FAQ',
    heading: 'Questions, answered',
    items: [
      { q: 'What is this platform?', a: 'A local rewards platform where customers unlock deals by visiting participating businesses, collecting QR rewards, or forming groups with friends.' },
      { q: 'Do customers need to download an app?', a: 'For the MVP, no. Customers use a mobile web app after scanning a QR code — nothing to install.' },
      { q: 'How do businesses verify customers?', a: 'Staff scan the customer’s personal QR to add a visit and redeem rewards — no codes to type.' },
      { q: 'Can rewards from one business be used at another?', a: 'No. Rewards are merchant-specific unless a special campaign says otherwise.' },
      { q: 'What types of businesses can use it?', a: 'Cafes, restaurants, salons, barbershops, bakeries, boutiques, gyms, and other local small businesses.' },
      { q: 'How do group deals work?', a: 'A business sets a group offer. Customers create or join a group, invite friends, check in together, and unlock the reward when the required number of people arrives.' },
      { q: 'Is this a payment app?', a: 'No. It works separately from payments. Customers can still pay by cash, card, MBANK, MegaPay, O!, or any other method.' },
    ],
  },
  form: {
    eyebrow: 'Register your business',
    heading: 'Start creating QR rewards and group offers',
    para:
      "Join the pilot. Tell us a bit about your business and we'll help you set up your first QR reward — usually in a single afternoon.",
    perks: [
      'Set up your first QR reward in an afternoon',
      'No tech skills or app build required',
      'Free during the Bishkek pilot',
    ],
    successTitle: "Thanks — you're on the list",
    successText: "We'll contact you to set up your first QR reward.",
    submitAnother: 'Submit another business',
    requestTitle: 'Request access',
    labels: { business: 'Business name', owner: 'Owner name', phone: 'Phone number', email: 'Email', category: 'Category', area: 'Area in Bishkek', instagram: 'Instagram', optional: '· optional' },
    placeholders: { business: 'Manas Coffee', owner: 'Aibek', phone: '700 123 456', email: 'you@example.com', area: 'e.g. Chuy Ave', instagram: '@yourbusiness' },
    categories: ['Cafe', 'Restaurant', 'Salon', 'Barbershop', 'Bakery', 'Boutique', 'Gym', 'Other'],
    submit: 'Request Access',
    submitting: 'Sending…',
    errorText: 'Something went wrong. Please try again.',
    validationErrorText: 'Please fill in all required fields and enter a valid email and phone number.',
  },
  finalCta: {
    heading: 'Ready to bring people together around local rewards?',
    para:
      'Join the pilot as a customer, or register your business to start creating QR rewards and group offers.',
    register: 'Register Your Business',
    explore: 'Explore Deals',
  },
  footer: {
    tagline: 'Local group rewards and QR loyalty for businesses in Bishkek.',
    colTitles: ['Product', 'Business', 'Contact'],
    productLinks: ['How it works', 'Group deals', 'QR loyalty', 'FAQ'],
    businessLinks: ['Register business', 'Dashboard', 'Join the pilot'],
    legal: '© 2026 Jaqyn · Bishkek, Kyrgyzstan',
    privacy: 'Privacy',
    terms: 'Terms',
  },
  mobile: { explore: 'Explore Deals', register: 'Register' },
};

export const ru: Dict = {
  nav: ['Как это работает', 'Для клиентов', 'Для бизнеса', 'Групповые акции', 'Вопросы'],
  header: { explore: 'Смотреть акции', register: 'Регистрация бизнеса', login: 'Войти' },
  hero: {
    badge: 'Пилот с локальными заведениями в Бишкеке',
    title: { lead: 'Награды за лояльность от мест, которые вы ', highlight: 'любите', trail: '.' },
    subtitle:
      'Копите штампы, открывайте ваучеры и участвуйте в кампаниях и групповых акциях местных кафе, салонов, барберов и магазинов — всё с одного QR-профиля. Без установки приложения.',
    ctaPrimary: 'Смотреть награды рядом →',
    ctaSecondary: 'Зарегистрировать бизнес',
    betterTitle: 'Вместе лучше.',
    betterSub: 'Награды открываются, когда приходит вся группа.',
    phone: {
      tag: 'Групповая акция · Кафе',
      offer: 'Бесплатный десерт для всего стола',
      sub: 'Приходите впятером с 14:00 до 17:00 сегодня.',
      forming: 'Группа собирается',
      invite: 'Пригласите ещё 1 друга',
      scan: 'Сканируйте, чтобы вступить',
      rewardUnlocked: 'Награда открыта',
      rewardReady: 'Бесплатный десерт · готово',
      friendsJoined: 'Друзей в группе',
    },
  },
  how: {
    eyebrow: 'Как это работает',
    heading: 'Четыре шага до первой награды',
    steps: [
      { title: 'Найдите местное заведение', text: 'Находите ближайшие кафе, салоны, барберов и магазины и их награды.' },
      { title: 'Покажите свой QR', text: 'Персонал сканирует ваш персональный QR при каждом визите — без кодов и без приложения.' },
      { title: 'Копите прогресс', text: 'Зарабатывайте штампы и прогресс к наградам, кампаниям и групповым акциям.' },
      { title: 'Откройте и потратьте', text: 'Достигните цели — и ваучер попадёт в кошелёк, готовый к использованию.' },
    ],
  },
  customers: {
    eyebrow: 'Для клиентов',
    heading: 'Всё заработанное — в одном кошельке наград',
    benefits: [
      { title: 'Кошелёк наград', text: 'Копите штампы и ваучеры в местных заведениях и тратьте их в одно касание.' },
      { title: 'Кампании и групповые акции', text: 'Участвуйте в визитных, временных и групповых кампаниях, чтобы зарабатывать больше.' },
      { title: 'Локальные открытия', text: 'Находите ближайшие кафе, рестораны, салоны, барберов и магазины на карте.' },
      { title: 'Один QR-профиль', text: 'Собирайте везде без отдельного приложения для каждого места.' },
    ],
    nearby: 'Акции рядом',
    find: 'Найти групповую акцию',
    deals: [
      { deal: 'Десерт ×5', tag: 'Группа' },
      { deal: '−20% на двоих', tag: '2+' },
      { deal: 'Закуска бесплатно', tag: '4+' },
    ],
  },
  business: {
    eyebrow: 'Для бизнеса',
    heading: 'Лояльность, кампании и отчёты в одной панели',
    para:
      'Запускайте штамп-карты и ваучерные награды, создавайте визитные, временные и групповые кампании и видьте, что действительно возвращает клиентов — всё в одной простой панели. Без отдельного приложения.',
    benefits: [
      { title: 'Программы лояльности', text: 'Награды за штампы, визиты и траты, которые автоматически создают ваучеры.' },
      { title: 'Кампании и групповые акции', text: 'Визитные, временные и групповые предложения, чтобы заполнить часы затишья.' },
      { title: 'Без своего приложения', text: 'QR-коды, приложение для персонала и простая веб-панель.' },
      { title: 'Важные отчёты', text: 'Сканирования, возвраты клиентов, выдачи, удержание и работа персонала.' },
    ],
    cta: 'Зарегистрировать бизнес →',
  },
  deals: {
    eyebrow: 'Групповые акции',
    heading: 'Превратите друзей в поток клиентов',
    para:
      'Заведения публикуют предложения вроде «приходите впятером и получите бесплатный десерт». Клиенты собирают группу, приглашают друзей и открывают награду только когда все действительно пришли.',
    offers: [
      { cat: 'Кафе', badge: 'Группа ×5', offer: 'Приходите впятером с 14:00 до 17:00 и получите бесплатный десерт для стола.', window: 'Сегодня' },
      { cat: 'Барбершоп', badge: 'Приведи 3', offer: 'Приведите 3 друзей на этой неделе — каждому 15% скидки на стрижку.', window: 'На этой неделе' },
      { cat: 'Салон', badge: 'Запись ×2', offer: 'Запишитесь с другом — обоим 20% скидки на выбранные услуги.', window: 'Пн–Чт' },
      { cat: 'Ресторан', badge: 'Группа 4+', offer: 'Группа от 4 человек получает бесплатную закуску для стола.', window: 'Каждый день' },
    ],
  },
  qr: {
    eyebrow: 'QR-лояльность',
    heading: 'Простые QR-награды для любого бизнеса',
    para:
      'Клиент показывает свой персональный QR, персонал сканирует его — визит и награда засчитываются в одно касание, без ввода кодов. Управляйте штамп-картами, ваучерами и кампаниями из одной панели.',
    bullets: ['Покажите свой QR', 'Персонал сканирует', 'Визит засчитан', 'Прогресс награды', 'Ваучер открыт', 'Отчёты для бизнеса'],
    steps: ['Покажите QR', 'Персонал сканирует', 'Получить штамп', 'Открыть награду'],
  },
  example: {
    eyebrow: 'Пример кампании',
    heading: 'Bishkek Coffee Crew Pass',
    para:
      'Кафе-участники предлагают групповые награды в спокойные дневные часы. Клиенты собирают группы, приглашают друзей, приходят вместе и открывают общие награды.',
    bizLabel: 'Ценность для бизнеса:',
    bizText: 'заведение даёт награду только когда группа действительно приходит.',
    custLabel: 'Ценность для клиента:',
    custText: 'повод выйти вместе и открыть новые местные места.',
    live: 'В эфире · Сегодня 14:00–18:00',
    cardTitle: 'Coffee Crew Pass',
    cafes: 'Кафе',
    mission: 'Миссия',
    missionValue: 'Визиты ×5',
    progress: 'Прогресс группы',
    joined: '3 / 5 в группе',
    rewardLabel: 'Награда:',
    rewardText: 'Бесплатный десерт / скидка для стола',
  },
  dashboard: {
    eyebrow: 'Панель бизнеса',
    heading: 'Всё, что нужно бизнесу для запуска акций',
    para:
      'Создавайте акции, управляйте QR-кодами, проверяйте группы, отслеживайте награды и понимайте, что действительно возвращает клиентов.',
    ownerSub: 'Панель владельца · последние 30 дней',
    arriving: '3 группы придут сегодня',
    widgets: [
      { label: 'Всего сканирований', delta: '+18% за месяц' },
      { label: 'Новые клиенты', delta: '+9% за месяц' },
      { label: 'Вернулись', delta: '+12% за месяц' },
      { label: 'Прим. выручка', delta: 'сом · 30 дней' },
      { label: 'Активные группы', delta: '6 собираются' },
      { label: 'Завершено', delta: 'групп пришло' },
      { label: 'Выдано', delta: 'наград выдано' },
      { label: 'Запланировано', delta: 'придут сегодня' },
    ],
    weekly: 'Сканирования за неделю',
    days: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
    active: 'Активные группы',
    groups: [
      { name: '5 в Manas Coffee', when: 'Сегодня · 15:00', status: 'Собирается' },
      { name: '4 в Tanyr Grill', when: 'Сегодня · 19:30', status: 'Подтверждено' },
      { name: '3 в Lush Salon', when: 'Завтра · 12:00', status: 'Завершено' },
    ],
  },
  trust: {
    eyebrow: 'Ранний доступ',
    heading: 'Создано для местного бизнеса в Бишкеке',
    para:
      'Разработано для малого и среднего бизнеса, которому нужны простые, измеримые акции — без создания своего приложения.',
    cards: [
      'Без скачивания приложения для клиентов',
      'Штамп-карты и кошелёк ваучеров',
      'Визитные, временные и групповые кампании',
      'QR-скан визита — без кодов',
      'Отчёты по удержанию и персоналу',
    ],
  },
  faq: {
    eyebrow: 'Частые вопросы',
    heading: 'Ответы на вопросы',
    items: [
      { q: 'Что это за платформа?', a: 'Платформа локальных наград, где клиенты открывают предложения, посещая заведения-участники, собирая QR-награды или формируя группы с друзьями.' },
      { q: 'Нужно ли клиентам скачивать приложение?', a: 'Для MVP — нет. Клиенты пользуются мобильным веб-приложением после сканирования QR-кода — ничего устанавливать не нужно.' },
      { q: 'Как заведения проверяют клиентов?', a: 'Персонал сканирует персональный QR клиента, чтобы засчитать визит и выдать награду — без ввода кодов.' },
      { q: 'Можно ли использовать награды одного заведения в другом?', a: 'Нет. Награды привязаны к конкретному заведению, если специальная кампания не предусматривает иное.' },
      { q: 'Какие виды бизнеса могут использовать это?', a: 'Кафе, рестораны, салоны, барбершопы, пекарни, бутики, спортзалы и другой местный малый бизнес.' },
      { q: 'Как работают групповые акции?', a: 'Заведение создаёт групповое предложение. Клиенты создают группу или вступают в неё, приглашают друзей, отмечаются вместе и открывают награду, когда приходит нужное число людей.' },
      { q: 'Это платёжное приложение?', a: 'Нет. Оно работает отдельно от платежей. Клиенты по-прежнему могут платить наличными, картой, через MBANK, MegaPay, O! или любым другим способом.' },
    ],
  },
  form: {
    eyebrow: 'Регистрация бизнеса',
    heading: 'Начните создавать QR-награды и групповые акции',
    para:
      'Присоединяйтесь к пилоту. Расскажите немного о своём бизнесе, и мы поможем настроить вашу первую QR-награду — обычно за один день.',
    perks: [
      'Настройте первую QR-награду за один день',
      'Без технических навыков и создания приложения',
      'Бесплатно во время пилота в Бишкеке',
    ],
    successTitle: 'Спасибо — вы в списке',
    successText: 'Мы свяжемся с вами, чтобы настроить первую QR-награду.',
    submitAnother: 'Отправить ещё один бизнес',
    requestTitle: 'Запросить доступ',
    labels: { business: 'Название бизнеса', owner: 'Имя владельца', phone: 'Номер телефона', email: 'Эл. почта', category: 'Категория', area: 'Район в Бишкеке', instagram: 'Instagram', optional: '· необязательно' },
    placeholders: { business: 'Manas Coffee', owner: 'Айбек', phone: '700 123 456', email: 'you@example.com', area: 'напр. пр. Чуй', instagram: '@вашбизнес' },
    categories: ['Кафе', 'Ресторан', 'Салон', 'Барбершоп', 'Пекарня', 'Бутик', 'Спортзал', 'Другое'],
    submit: 'Запросить доступ',
    submitting: 'Отправка…',
    errorText: 'Что-то пошло не так. Пожалуйста, попробуйте снова.',
    validationErrorText: 'Пожалуйста, заполните все обязательные поля и введите корректный email и номер телефона.',
  },
  finalCta: {
    heading: 'Готовы объединять людей вокруг локальных наград?',
    para:
      'Присоединяйтесь к пилоту как клиент или зарегистрируйте бизнес, чтобы начать создавать QR-награды и групповые акции.',
    register: 'Зарегистрировать бизнес',
    explore: 'Смотреть акции',
  },
  footer: {
    tagline: 'Локальные групповые награды и QR-лояльность для бизнеса в Бишкеке.',
    colTitles: ['Продукт', 'Бизнес', 'Контакты'],
    productLinks: ['Как это работает', 'Групповые акции', 'QR-лояльность', 'Вопросы'],
    businessLinks: ['Регистрация бизнеса', 'Панель', 'Присоединиться к пилоту'],
    legal: '© 2026 Jaqyn · Бишкек, Кыргызстан',
    privacy: 'Конфиденциальность',
    terms: 'Условия',
  },
  mobile: { explore: 'Акции', register: 'Регистрация' },
};

export const ky: Dict = {
  nav: ['Кантип иштейт', 'Кардарлар үчүн', 'Бизнес үчүн', 'Топтук сунуштар', 'Суроолор'],
  header: { explore: 'Сунуштарды көрүү', register: 'Бизнести каттоо', login: 'Кирүү' },
  hero: {
    badge: 'Бишкектеги жергиликтүү жайлар менен пилот',
    title: { lead: 'Сиз жактырган жергиликтүү жайлардын лоялдуулук ', highlight: 'сыйлыктары', trail: '.' },
    subtitle:
      'Жергиликтүү кафе, салон, чач тарач жана дүкөндөрдөн штамп чогултуп, ваучер ачып, кампанияларга жана топтук акцияларга катышыңыз — баары бир QR профилден. Тиркеме орнотуунун кереги жок.',
    ctaPrimary: 'Жакынкы сыйлыктарды көрүү →',
    ctaSecondary: 'Бизнесиңизди каттоо',
    betterTitle: 'Чогуу жакшы.',
    betterSub: 'Сыйлыктар топ толук келгенде ачылат.',
    phone: {
      tag: 'Топтук акция · Кафе',
      offer: 'Бүт стол үчүн акысыз десерт',
      sub: 'Бүгүн 14:00–17:00 аралыгында бешөө болуп келиңиз.',
      forming: 'Топ түзүлүүдө',
      invite: 'Дагы 1 досту чакырыңыз',
      scan: 'Кошулуу үчүн скандаңыз',
      rewardUnlocked: 'Сыйлык ачылды',
      rewardReady: 'Акысыз десерт · даяр',
      friendsJoined: 'Кошулган достор',
    },
  },
  how: {
    eyebrow: 'Кантип иштейт',
    heading: 'Биринчи сыйлыкка чейин төрт кадам',
    steps: [
      { title: 'Жергиликтүү жай табыңыз', text: 'Жакынкы кафе, салон, чач тарач жана дүкөндөрдү жана алардын сыйлыктарын табыңыз.' },
      { title: 'QR кодуңузду көрсөтүңүз', text: 'Ар бир барууда кызматкер жеке QR кодуңузду скандайт — код киргизбей, тиркемесиз.' },
      { title: 'Прогресс чогултуңуз', text: 'Штамп жана сыйлыктарга, кампанияларга, топтук акцияларга карай прогресс топтоңуз.' },
      { title: 'Ачып, колдонуңуз', text: 'Максатка жетиңиз — ваучер капчыгыңызга түшүп, колдонууга даяр болот.' },
    ],
  },
  customers: {
    eyebrow: 'Кардарлар үчүн',
    heading: 'Чогулткандын баары бир сыйлык капчыгында',
    benefits: [
      { title: 'Сыйлык капчыгы', text: 'Жергиликтүү жайларда штамп жана ваучер чогултуп, бир тийүүдө колдонуңуз.' },
      { title: 'Кампаниялар жана топтук акциялар', text: 'Көбүрөөк табуу үчүн баруу, убакыт жана топтук кампанияларга катышыңыз.' },
      { title: 'Жергиликтүү ачылыштар', text: 'Жакынкы кафе, ресторан, салон, чач тарач жана дүкөндөрдү картадан табыңыз.' },
      { title: 'Бирдиктүү QR профиль', text: 'Ар бир жайга өзүнчө тиркемесиз бардык жерден чогултуңуз.' },
    ],
    nearby: 'Жакынкы акциялар',
    find: 'Топтук акция табуу',
    deals: [
      { deal: 'Десерт ×5', tag: 'Топ' },
      { deal: 'Экөөгө −20%', tag: '2+' },
      { deal: 'Акысыз закуска', tag: '4+' },
    ],
  },
  business: {
    eyebrow: 'Бизнес үчүн',
    heading: 'Лоялдуулук, кампаниялар жана отчёттор бир панелде',
    para:
      'Штамп-карталарды жана ваучер сыйлыктарын иштетиңиз, баруу, убакыт жана топтук кампанияларды баштаңыз жана кардарларды эмне кайтарарын көрүңүз — баары бир жөнөкөй панелде. Өзүнчө тиркеменин кереги жок.',
    benefits: [
      { title: 'Лоялдуулук программалары', text: 'Ваучерлерди автоматтык түрдө түзгөн штамп, баруу жана сарптоо сыйлыктары.' },
      { title: 'Кампаниялар жана топтук акциялар', text: 'Бош сааттарды толтуруу үчүн баруу, убакыт жана топтук сунуштар.' },
      { title: 'Өзүнчө тиркеме жок', text: 'QR коддор, кызматкерлер үчүн тиркеме жана жөнөкөй веб-панель.' },
      { title: 'Маанилүү отчёттор', text: 'Скандар, кайтып келген кардарлар, берүүлөр, кармап туруу жана кызматкерлердин иши.' },
    ],
    cta: 'Бизнесиңизди каттоо →',
  },
  deals: {
    eyebrow: 'Топтук акциялар',
    heading: 'Досторду кардарлар агымына айлантыңыз',
    para:
      'Жайлар «бешөө болуп келип, акысыз десерт алыңыз» сыяктуу сунуштарды жайгаштырат. Кардарлар топ түзүп, досторун чакырып, баары чындап келгенде гана сыйлыкты ачышат.',
    offers: [
      { cat: 'Кафе', badge: 'Топ ×5', offer: '14:00–17:00 аралыгында бешөө болуп келип, стол үчүн акысыз десерт алыңыз.', window: 'Бүгүн' },
      { cat: 'Барбер', badge: '3 ала кел', offer: 'Бул жумада 3 досуңузду алып келиңиз — ар бирине чач алууга 15% арзандатуу.', window: 'Бул жума' },
      { cat: 'Салон', badge: 'Жазылуу ×2', offer: 'Досуңуз менен жазылыңыз — экөөнө тең тандалган кызматтарга 20% арзандатуу.', window: 'Дүй–Бей' },
      { cat: 'Ресторан', badge: 'Топ 4+', offer: '4 же андан көп адамдан турган топ стол үчүн акысыз закуска алат.', window: 'Күн сайын' },
    ],
  },
  qr: {
    eyebrow: 'QR лоялдуулук',
    heading: 'Ар бир бизнес үчүн жөнөкөй QR сыйлыктар',
    para:
      'Кардар өзүнүн жеке QR кодун көрсөтөт, кызматкер аны скандайт — баруу жана сыйлык бир тийүүдө эсептелет, код киргизүүнүн кереги жок. Штамп-карталарды, ваучерлерди жана кампанияларды бир панелден башкарыңыз.',
    bullets: ['QR кодуңузду көрсөтүңүз', 'Кызматкер скандайт', 'Баруу эсептелди', 'Сыйлык прогресси', 'Ваучер ачылды', 'Бизнес отчёттору'],
    steps: ['QR көрсөтүү', 'Кызматкер скандайт', 'Штамп алуу', 'Сыйлык ачуу'],
  },
  example: {
    eyebrow: 'Кампания мисалы',
    heading: 'Bishkek Coffee Crew Pass',
    para:
      'Катышкан кафелер күндүзгү бош сааттарда топтук сыйлыктарды сунушташат. Кардарлар топ түзүп, досторун чакырып, чогуу келип, жалпы сыйлыктарды ачышат.',
    bizLabel: 'Бизнес үчүн баалуулук:',
    bizText: 'жай сыйлыкты топ чындап келгенде гана берет.',
    custLabel: 'Кардар үчүн баалуулук:',
    custText: 'чогуу чыгып, жаңы жергиликтүү жайларды ачууга себеп.',
    live: 'Түз эфирде · Бүгүн 14:00–18:00',
    cardTitle: 'Coffee Crew Pass',
    cafes: 'Кафелер',
    mission: 'Миссия',
    missionValue: 'Баруу ×5',
    progress: 'Топтун прогресси',
    joined: '3 / 5 кошулду',
    rewardLabel: 'Сыйлык:',
    rewardText: 'Стол үчүн акысыз десерт / арзандатуу',
  },
  dashboard: {
    eyebrow: 'Бизнес панели',
    heading: 'Бизнеске акцияларды жүргүзүү үчүн керектүүнүн баары',
    para:
      'Акцияларды түзүңүз, QR коддорду башкарыңыз, топторду текшериңиз, сыйлыктарды көзөмөлдөңүз жана кардарларды эмне кайтарарын түшүнүңүз.',
    ownerSub: 'Ээсинин панели · акыркы 30 күн',
    arriving: 'Бүгүн 3 топ келет',
    widgets: [
      { label: 'Бардык скандар', delta: '+18% бул айда' },
      { label: 'Жаңы кардарлар', delta: '+9% бул айда' },
      { label: 'Кайтып келгендер', delta: '+12% бул айда' },
      { label: 'Болжолдуу киреше', delta: 'сом · 30 күн' },
      { label: 'Активдүү топтор', delta: '6 түзүлүүдө' },
      { label: 'Аякталды', delta: 'топ келди' },
      { label: 'Берилди', delta: 'сыйлык берилди' },
      { label: 'Пландалган', delta: 'бүгүн келет' },
    ],
    weekly: 'Жума ичиндеги скандар',
    days: ['Дүй', 'Шей', 'Шар', 'Бей', 'Жум', 'Ише', 'Жек'],
    active: 'Активдүү топтор',
    groups: [
      { name: "Manas Coffee'де 5", when: 'Бүгүн · 15:00', status: 'Түзүлүүдө' },
      { name: "Tanyr Grill'де 4", when: 'Бүгүн · 19:30', status: 'Ырасталды' },
      { name: "Lush Salon'до 3", when: 'Эртең · 12:00', status: 'Аякталды' },
    ],
  },
  trust: {
    eyebrow: 'Эрте кирүү',
    heading: 'Бишкектеги жергиликтүү бизнес үчүн жасалган',
    para:
      'Өз тиркемесин жасабай туруп, жөнөкөй жана өлчөнүүчү акцияларды каалаган чакан жана орто бизнес үчүн иштелип чыккан.',
    cards: [
      'Кардарларга тиркеме жүктөөнүн кереги жок',
      'Штамп-карталар жана ваучер капчыгы',
      'Баруу, убакыт жана топтук кампаниялар',
      'QR баруу сканы — кодсуз',
      'Кармап туруу жана кызматкер отчёттору',
    ],
  },
  faq: {
    eyebrow: 'Көп берилүүчү суроолор',
    heading: 'Суроолорго жооптор',
    items: [
      { q: 'Бул кандай платформа?', a: 'Кардарлар катышкан жайларга барып, QR сыйлыктарын чогултуп же достору менен топ түзүп сунуштарды ача турган жергиликтүү сыйлык платформасы.' },
      { q: 'Кардарлар тиркеме жүктөшү керекпи?', a: 'MVP үчүн жок. Кардарлар QR кодду скандагандан кийин мобилдик веб-тиркемени колдонушат — эч нерсе орнотуунун кереги жок.' },
      { q: 'Жайлар кардарларды кантип текшерет?', a: 'Кызматкер кардардын жеке QR кодун скандап, баруу эсептейт жана сыйлык берет — код киргизүүнүн кереги жок.' },
      { q: 'Бир жайдын сыйлыгын башка жайда колдонсо болобу?', a: 'Жок. Атайын кампания башкача айтпаса, сыйлыктар белгилүү бир жайга гана таандык.' },
      { q: 'Кандай бизнес түрлөрү колдоно алат?', a: 'Кафе, ресторан, салон, барбершоп, наабайканалар, бутиктер, спортзалдар жана башка жергиликтүү чакан бизнес.' },
      { q: 'Топтук акциялар кантип иштейт?', a: 'Жай топтук сунуш түзөт. Кардарлар топ түзөт же кошулат, досторун чакырат, чогуу белгиленет жана керектүү сандагы адам келгенде сыйлыкты ачат.' },
      { q: 'Бул төлөм тиркемесиби?', a: 'Жок. Ал төлөмдөрдөн өзүнчө иштейт. Кардарлар мурдагыдай эле нак акча, карта, MBANK, MegaPay, O! же башка ыкма менен төлөй алышат.' },
    ],
  },
  form: {
    eyebrow: 'Бизнести каттоо',
    heading: 'QR сыйлыктарды жана топтук сунуштарды түзө баштаңыз',
    para:
      'Пилотко кошулуңуз. Бизнесиңиз тууралуу бир аз айтып бериңиз, биз биринчи QR сыйлыгыңызды жөндөөгө жардам беребиз — адатта бир күндө.',
    perks: [
      'Биринчи QR сыйлыгыңызды бир күндө жөндөңүз',
      'Техникалык көндүм же тиркеме жасоонун кереги жок',
      'Бишкек пилотунда акысыз',
    ],
    successTitle: 'Рахмат — сиз тизмедесиз',
    successText: 'Биринчи QR сыйлыгыңызды жөндөө үчүн сиз менен байланышабыз.',
    submitAnother: 'Дагы бир бизнес жөнөтүү',
    requestTitle: 'Уруксат суроо',
    labels: { business: 'Бизнестин аталышы', owner: 'Ээсинин аты', phone: 'Телефон номери', email: 'Электрондук почта', category: 'Категория', area: 'Бишкектеги аймак', instagram: 'Instagram', optional: '· милдеттүү эмес' },
    placeholders: { business: 'Manas Coffee', owner: 'Айбек', phone: '700 123 456', email: 'you@example.com', area: 'мис. Чүй пр.', instagram: '@бизнесиңиз' },
    categories: ['Кафе', 'Ресторан', 'Салон', 'Барбершоп', 'Наабайкана', 'Бутик', 'Спортзал', 'Башка'],
    submit: 'Уруксат сурайм',
    submitting: 'Жөнөтүлүүдө…',
    errorText: 'Бир нерсе туура болгон жок. Кайра аракет кылыңыз.',
    validationErrorText: 'Бардык милдеттүү талааларды толтуруп, туура email жана телефон номерин киргизиңиз.',
  },
  finalCta: {
    heading: 'Адамдарды жергиликтүү сыйлыктар тегерегинде бириктирүүгө даярсызбы?',
    para:
      'Кардар катары пилотко кошулуңуз же QR сыйлыктарды жана топтук сунуштарды түзө баштоо үчүн бизнесиңизди каттаңыз.',
    register: 'Бизнесиңизди каттоо',
    explore: 'Акцияларды көрүү',
  },
  footer: {
    tagline: 'Бишкектеги бизнес үчүн жергиликтүү топтук сыйлыктар жана QR лоялдуулук.',
    colTitles: ['Продукт', 'Бизнес', 'Байланыш'],
    productLinks: ['Кантип иштейт', 'Топтук акциялар', 'QR лоялдуулук', 'Суроолор'],
    businessLinks: ['Бизнести каттоо', 'Панель', 'Пилотко кошулуу'],
    legal: '© 2026 Jaqyn · Бишкек, Кыргызстан',
    privacy: 'Купуялык',
    terms: 'Шарттар',
  },
  mobile: { explore: 'Акциялар', register: 'Каттоо' },
};

export type LangCode = 'ru' | 'ky' | 'en';

export const dictionaries: Record<LangCode, Dict> = { ru, ky, en };

export interface LanguageMeta { code: LangCode; label: string; name: string; }
export const languages: LanguageMeta[] = [
  { code: 'ru', label: 'RU', name: 'Русский' },
  { code: 'ky', label: 'KG', name: 'Кыргызча' },
  { code: 'en', label: 'EN', name: 'English' },
];

export const DEFAULT_LANG: LangCode = 'ru';
