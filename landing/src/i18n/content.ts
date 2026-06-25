import type { CSSProperties } from 'react';
import { ACCENT, ACCENT_DEEP, avatar, smallAvatar, iconTile } from '../theme';
import { APP_ROUTES } from '../config';
import type { Dict } from './translations';

// ===== element shapes consumed by components =====
export interface NavLink { label: string; href: string; }
export interface Avatar { ch: string; style: CSSProperties; }
export interface HowStep { n: string; title: string; text: string; delay: number; }
export interface Benefit { title: string; text: string; glyph: string; icon: CSSProperties; delay: number; }
export interface MiniDeal { ch: string; name: string; deal: string; tag: string; bg: string; }
export interface DealOffer { ch: string; name: string; cat: string; bg: string; badge: string; offer: string; window: string; avatars: Avatar[]; }
export interface QrStep { label: string; glyph: string; box: CSSProperties; arrow: boolean; }
export interface DashWidget { label: string; value: number; display: string; prefix: string; suffix: string; delta: string; }
export interface ChartBar { day: string; h: string; fill: string; }
export interface GroupRow { name: string; when: string; status: string; tagStyle: CSSProperties; }
export interface TrustCard { label: string; delay: number; }
export interface FooterCol { title: string; links: NavLink[]; }

export interface Content {
  t: Dict;
  navLinks: NavLink[];
  heroAvatars: Avatar[];
  howSteps: HowStep[];
  custBenefits: Benefit[];
  miniDeals: MiniDeal[];
  bizBenefits: Benefit[];
  dealOffers: DealOffer[];
  qrSteps: QrStep[];
  dashWidgets: DashWidget[];
  chartBars: ChartBar[];
  groupRows: GroupRow[];
  trustCards: TrustCard[];
  footerCols: FooterCol[];
  categoryValues: string[];
}

// ===== static (language-independent) structure & styling =====
const NAV_HREFS = ['#how', '#customers', '#business', '#deals', '#faq'];

const HERO_AVATARS: Avatar[] = [
  { ch: 'A', style: avatar('#D9B98F', '#5a4326') },
  { ch: 'B', style: avatar('#A9C0A0', '#3a4d33') },
  { ch: 'N', style: avatar('#E0A9A0', '#6b3b33') },
  { ch: '+2', style: avatar(ACCENT, '#fff') },
];

const STEP_N = ['1', '2', '3', '4'];
const DELAYS = [0, 80, 160, 240];

const CUST_ICONS = [
  iconTile('rgba(194,94,60,.12)', ACCENT),
  iconTile('rgba(231,162,62,.16)', '#E7A23E'),
  iconTile('rgba(94,139,106,.14)', '#5E8B6A'),
  iconTile('rgba(46,36,29,.07)', '#2E241D'),
];
const CUST_GLYPHS = ['◎', '◇', '▦', '◐'];

const MINI_DEAL_META = [
  { ch: 'M', name: 'Manas Coffee', bg: `linear-gradient(150deg,${ACCENT},${ACCENT_DEEP})` },
  { ch: 'L', name: 'Lush Salon', bg: '#5E8B6A' },
  { ch: 'T', name: 'Tanyr Grill', bg: '#E7A23E' },
];

const BIZ_ICON = iconTile('rgba(231,162,62,.2)', '#E7A23E');
const BIZ_GLYPHS = ['◷', '◎', '▦', '▤'];

const DEAL_META = [
  { ch: 'M', name: 'Manas Coffee', bg: `linear-gradient(150deg,${ACCENT},${ACCENT_DEEP})`, avatars: [{ ch: 'A', style: smallAvatar('#D9B98F', '#5a4326') }, { ch: 'B', style: smallAvatar('#A9C0A0', '#3a4d33') }, { ch: '+3', style: smallAvatar('#E7A23E', '#fff') }] },
  { ch: 'A', name: 'Aibek Barber', bg: '#2E241D', avatars: [{ ch: 'K', style: smallAvatar('#B8A9D8', '#3f3360') }, { ch: '+2', style: smallAvatar(ACCENT, '#fff') }] },
  { ch: 'L', name: 'Lush Salon', bg: '#5E8B6A', avatars: [{ ch: 'N', style: smallAvatar('#E0A9A0', '#6b3b33') }, { ch: '+1', style: smallAvatar(ACCENT, '#fff') }] },
  { ch: 'T', name: 'Tanyr Grill', bg: '#E7A23E', avatars: [{ ch: 'D', style: smallAvatar('#D9B98F', '#5a4326') }, { ch: '+3', style: smallAvatar(ACCENT, '#fff') }] },
];

const QR_STEP_META = [
  { glyph: '▦', box: iconTile('rgba(46,36,29,.07)', '#2E241D'), arrow: true },
  { glyph: '⌘', box: iconTile('rgba(231,162,62,.16)', '#E7A23E'), arrow: true },
  { glyph: '◉', box: iconTile('rgba(194,94,60,.12)', ACCENT), arrow: true },
  { glyph: '★', box: iconTile('rgba(94,139,106,.14)', '#5E8B6A'), arrow: false },
];

const WIDGET_META = [
  { value: 1284, display: '1,284', prefix: '', suffix: '' },
  { value: 312, display: '312', prefix: '', suffix: '' },
  { value: 196, display: '196', prefix: '', suffix: '' },
  { value: 840, display: '840K', prefix: '', suffix: 'K' },
  { value: 18, display: '18', prefix: '', suffix: '' },
  { value: 142, display: '142', prefix: '', suffix: '' },
  { value: 487, display: '487', prefix: '', suffix: '' },
  { value: 7, display: '7', prefix: '', suffix: '' },
];

const CHART_META = [
  { h: '54%', fill: 'rgba(46,36,29,.18)' },
  { h: '68%', fill: 'rgba(46,36,29,.18)' },
  { h: '46%', fill: 'rgba(46,36,29,.18)' },
  { h: '82%', fill: '#E7A23E' },
  { h: '100%', fill: ACCENT },
  { h: '90%', fill: '#E7A23E' },
  { h: '62%', fill: 'rgba(46,36,29,.18)' },
];

const GROUP_TAG_STYLES: CSSProperties[] = [
  { background: 'rgba(231,162,62,.16)', color: '#B07A1E' },
  { background: 'rgba(94,139,106,.16)', color: '#3F6149' },
  { background: 'rgba(46,36,29,.08)', color: '#6B5A4A' },
];

const CATEGORY_VALUES = ['Cafe', 'Restaurant', 'Salon', 'Barbershop', 'Bakery', 'Boutique', 'Gym', 'Other'];

const CONTACT_LINKS: NavLink[] = [
  { label: 'Instagram', href: 'https://instagram.com/jaqyn.kg' },
  { label: 'Telegram', href: 'https://t.me/jaqyn_kg' },
  { label: 'hello@jaqyn.kg', href: 'mailto:hello@jaqyn.kg' },
];
const PRODUCT_HREFS = ['#how', '#deals', '#qr', '#faq'];
// businessLinks = [Register business, Dashboard, Join the pilot].
// Dashboard points at the live business login; the other two open the lead form.
const BUSINESS_HREFS = ['#register', APP_ROUTES.businessLogin, '#register'];

// ===== merge dict text with static structure =====
export function buildContent(t: Dict): Content {
  return {
    t,
    navLinks: t.nav.map((label, i) => ({ label, href: NAV_HREFS[i] })),
    heroAvatars: HERO_AVATARS,
    howSteps: t.how.steps.map((s, i) => ({ n: STEP_N[i], title: s.title, text: s.text, delay: DELAYS[i] })),
    custBenefits: t.customers.benefits.map((b, i) => ({ title: b.title, text: b.text, glyph: CUST_GLYPHS[i], icon: CUST_ICONS[i], delay: DELAYS[i] })),
    miniDeals: t.customers.deals.map((d, i) => ({ ...MINI_DEAL_META[i], deal: d.deal, tag: d.tag })),
    bizBenefits: t.business.benefits.map((b, i) => ({ title: b.title, text: b.text, glyph: BIZ_GLYPHS[i], icon: BIZ_ICON, delay: DELAYS[i] })),
    dealOffers: t.deals.offers.map((o, i) => ({ ...DEAL_META[i], cat: o.cat, badge: o.badge, offer: o.offer, window: o.window })),
    qrSteps: t.qr.steps.map((label, i) => ({ label, ...QR_STEP_META[i] })),
    dashWidgets: t.dashboard.widgets.map((w, i) => ({ ...WIDGET_META[i], label: w.label, delta: w.delta })),
    chartBars: t.dashboard.days.map((day, i) => ({ day, ...CHART_META[i] })),
    groupRows: t.dashboard.groups.map((g, i) => ({ name: g.name, when: g.when, status: g.status, tagStyle: GROUP_TAG_STYLES[i] })),
    trustCards: t.trust.cards.map((label, i) => ({ label, delay: i * 60 })),
    footerCols: [
      { title: t.footer.colTitles[0], links: t.footer.productLinks.map((label, i) => ({ label, href: PRODUCT_HREFS[i] })) },
      { title: t.footer.colTitles[1], links: t.footer.businessLinks.map((label, i) => ({ label, href: BUSINESS_HREFS[i] })) },
      { title: t.footer.colTitles[2], links: CONTACT_LINKS },
    ],
    categoryValues: CATEGORY_VALUES,
  };
}
