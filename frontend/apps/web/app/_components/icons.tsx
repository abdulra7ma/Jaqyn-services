// Line icons (Lucide-style) for nav + UI. Stroke = currentColor so active state
// is just a text-color change.
type Props = { className?: string };

const base = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function HomeIcon(p: Props) {
  return (
    <svg {...base} className={p.className}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" />
      <path d="M9.5 21v-6h5v6" />
    </svg>
  );
}

export function GiftIcon(p: Props) {
  return (
    <svg {...base} className={p.className}>
      <rect x="3" y="8" width="18" height="4" rx="1" />
      <path d="M5 12v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8" />
      <path d="M12 8v13" />
      <path d="M12 8S10.5 3.5 8 4.2 8.5 8 12 8Zm0 0s1.5-4.5 4-3.8S15.5 8 12 8Z" />
    </svg>
  );
}

/** Shared wallet glyph for every entry point into the customer's loyalty wallet. */
export function WalletIcon(p: Props) {
  return (
    <svg {...base} className={p.className} data-icon="wallet">
      <path d="M5 6.5h12.5A2.5 2.5 0 0 1 20 9v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8.5a2 2 0 0 1 2-2Z" />
      <path d="M5.5 6.5V5.7A1.7 1.7 0 0 1 7.2 4h9.3" />
      <path d="M15 11h6v5h-6a2.5 2.5 0 0 1 0-5Z" />
      <circle cx="16.5" cy="13.5" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function ImageIcon(p: Props) {
  return (
    <svg {...base} className={p.className}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
    </svg>
  );
}

export function ListIcon(p: Props) {
  return (
    <svg {...base} className={p.className}>
      <path d="M8 6h13" />
      <path d="M8 12h13" />
      <path d="M8 18h13" />
      <path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
    </svg>
  );
}

export function UsersIcon(p: Props) {
  return (
    <svg {...base} className={p.className}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
      <path d="M16 5.2a3.2 3.2 0 0 1 0 6.1" />
      <path d="M17 14.5a5.5 5.5 0 0 1 3.5 5.5" />
    </svg>
  );
}

export function PinIcon(p: Props) {
  return (
    <svg {...base} className={p.className}>
      <path d="M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.6" />
    </svg>
  );
}

export function FlagIcon(p: Props) {
  return (
    <svg {...base} className={p.className}>
      <path d="M5 21V4" />
      <path d="M5 4h11l-1.5 3.5L16 11H5" />
    </svg>
  );
}

export function UserIcon(p: Props) {
  return (
    <svg {...base} className={p.className}>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  );
}

export function ScanIcon(p: Props) {
  return (
    <svg {...base} className={p.className}>
      <path d="M4 8V5a1 1 0 0 1 1-1h3" />
      <path d="M16 4h3a1 1 0 0 1 1 1v3" />
      <path d="M20 16v3a1 1 0 0 1-1 1h-3" />
      <path d="M8 20H5a1 1 0 0 1-1-1v-3" />
      <path d="M4 12h16" />
    </svg>
  );
}

export function QrIcon(p: Props) {
  return (
    <svg {...base} className={p.className}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <path d="M14 14h3v3h-3zM20 14v3M17 20h4M14 20h.01" />
    </svg>
  );
}

export function CameraIcon(p: Props) {
  return (
    <svg {...base} className={p.className}>
      <path d="M8 6.5 9.5 4h5L16 6.5h3A2 2 0 0 1 21 8.5v9A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5v-9a2 2 0 0 1 2-2Z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

export function ChartIcon(p: Props) {
  return (
    <svg {...base} className={p.className}>
      <path d="M4 20V10" />
      <path d="M10 20V4" />
      <path d="M16 20v-7" />
      <path d="M3 20h18" />
    </svg>
  );
}

export function GridIcon(p: Props) {
  return (
    <svg {...base} className={p.className}>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
    </svg>
  );
}

export function MegaphoneIcon(p: Props) {
  return (
    <svg {...base} className={p.className}>
      <path d="M3 10v4a1 1 0 0 0 1 1h3l8 4V5L7 9H4a1 1 0 0 0-1 1Z" />
      <path d="M18.5 8.5a5 5 0 0 1 0 7" />
      <path d="M7 15v3a1 1 0 0 0 1 1h1.5" />
    </svg>
  );
}

export function TicketIcon(p: Props) {
  return (
    <svg {...base} className={p.className}>
      <path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2 2 2 0 0 0 0 4 2 2 0 0 1-2 2H6a2 2 0 0 1-2-2 2 2 0 0 0 0-4Z" />
      <path d="M14 6v12" strokeDasharray="1.5 2.5" />
    </svg>
  );
}

export function SettingsIcon(p: Props) {
  return (
    <svg {...base} className={p.className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v2.4M12 19.1v2.4M4.2 7l2 1.2M17.8 15.8l2 1.2M19.8 7l-2 1.2M6.2 15.8l-2 1.2" />
    </svg>
  );
}

export function GlobeIcon(p: Props) {
  return (
    <svg {...base} className={p.className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c2.5 2.4 3.8 5.6 3.8 9s-1.3 6.6-3.8 9c-2.5-2.4-3.8-5.6-3.8-9S9.5 5.4 12 3Z" />
    </svg>
  );
}

export function MoreIcon(p: Props) {
  return (
    <svg {...base} className={p.className}>
      <circle cx="5" cy="12" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="19" cy="12" r="1.4" />
    </svg>
  );
}

export function ChevronLeftIcon(p: Props) {
  return (
    <svg {...base} className={p.className}>
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

export function ChevronRightIcon(p: Props) {
  return (
    <svg {...base} className={p.className}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
