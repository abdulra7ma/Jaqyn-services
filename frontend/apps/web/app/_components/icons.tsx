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

export function MoreIcon(p: Props) {
  return (
    <svg {...base} className={p.className}>
      <circle cx="5" cy="12" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="19" cy="12" r="1.4" />
    </svg>
  );
}
