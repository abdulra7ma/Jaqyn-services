"use client";

import { useT } from "@jaqyn/i18n";

// ---- mini-visual SVG icons ----

/** Stamp row (retention): 5 small dots, last is a star */
function IconStamps() {
  return (
    <svg viewBox="0 0 48 24" aria-hidden className="h-6 w-12">
      {[0, 1, 2, 3].map((i) => (
        <circle key={i} cx={6 + i * 11} cy={12} r={4} fill="currentColor" opacity={0.5} />
      ))}
      {/* filled dot */}
      <circle cx={50} cy={12} r={4} fill="currentColor" />
      <text x={42} y={16} fontSize={10} fill="currentColor" fontWeight="bold">★</text>
    </svg>
  );
}

/** Map pin (on-the-map) */
function IconPin() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7Z" />
      <circle cx={12} cy={9} r={2.5} fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Group / people (group campaigns) */
function IconGroup() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-6 w-6" fill="currentColor">
      <circle cx={9} cy={7} r={3} />
      <circle cx={15} cy={7} r={3} />
      <path d="M3 19c0-3.31 2.69-6 6-6h6c3.31 0 6 2.69 6 6" />
    </svg>
  );
}

/** Bar chart (analytics) */
function IconChart() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-6 w-6" fill="currentColor">
      <rect x={3} y={14} width={4} height={7} rx={1} />
      <rect x={10} y={9} width={4} height={12} rx={1} />
      <rect x={17} y={5} width={4} height={16} rx={1} />
    </svg>
  );
}

/** Gift / voucher */
function IconGift() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x={3} y={8} width={18} height={14} rx={1} />
      <path d="M12 8V22M3 13h18" />
      <path d="M8 8C8 5.79 9.79 4 12 4s4 1.79 4 4" />
    </svg>
  );
}

/** QR / phone (no-app) */
function IconQr() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-6 w-6" fill="currentColor">
      <rect x={3} y={3} width={7} height={7} rx={1} />
      <rect x={4} y={4} width={5} height={5} rx={0.5} fill="white" />
      <rect x={5} y={5} width={3} height={3} rx={0.5} />
      <rect x={14} y={3} width={7} height={7} rx={1} />
      <rect x={15} y={4} width={5} height={5} rx={0.5} fill="white" />
      <rect x={16} y={5} width={3} height={3} rx={0.5} />
      <rect x={3} y={14} width={7} height={7} rx={1} />
      <rect x={4} y={15} width={5} height={5} rx={0.5} fill="white" />
      <rect x={5} y={16} width={3} height={3} rx={0.5} />
      <rect x={14} y={14} width={3} height={3} rx={0.5} />
      <rect x={18} y={14} width={3} height={3} rx={0.5} />
      <rect x={14} y={18} width={3} height={3} rx={0.5} />
      <rect x={18} y={18} width={3} height={3} rx={0.5} />
    </svg>
  );
}

// ---- block data ----

type BlockDef = {
  id: string;
  Icon: React.FC;
  titleKey: string;
  bodyKey: string;
};

const BLOCKS: BlockDef[] = [
  { id: "retention", Icon: IconStamps, titleKey: "pitch.feat.retention.title", bodyKey: "pitch.feat.retention.body" },
  { id: "map", Icon: IconPin, titleKey: "pitch.feat.map.title", bodyKey: "pitch.feat.map.body" },
  { id: "group", Icon: IconGroup, titleKey: "pitch.feat.group.title", bodyKey: "pitch.feat.group.body" },
  { id: "analytics", Icon: IconChart, titleKey: "pitch.feat.analytics.title", bodyKey: "pitch.feat.analytics.body" },
  { id: "vouchers", Icon: IconGift, titleKey: "pitch.feat.vouchers.title", bodyKey: "pitch.feat.vouchers.body" },
  { id: "noapp", Icon: IconQr, titleKey: "pitch.feat.noapp.title", bodyKey: "pitch.feat.noapp.body" },
];

// ---- FeatureBlock ----

type FeatureBlockProps = {
  block: BlockDef;
  businessName: string;
  goal: number;
  reward: string;
};

function FeatureBlock({ block, businessName, goal, reward }: FeatureBlockProps) {
  const t = useT();
  const { Icon, titleKey, bodyKey } = block;

  const body = t(bodyKey)
    .replace("{name}", businessName)
    .replace("{n}", String(goal))
    .replace("{reward}", reward);

  return (
    <div className="flex items-start gap-4 rounded-xl border border-line bg-card p-4 shadow-card">
      {/* icon tile */}
      <div
        aria-hidden
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-tile text-brand"
      >
        <Icon />
      </div>
      <div>
        <p className="font-display text-[15px] font-bold text-ink">{t(titleKey)}</p>
        <p className="mt-0.5 text-[13.5px] leading-snug text-subtle">{body}</p>
      </div>
    </div>
  );
}

// ---- FeatureBlocks ----

export type FeatureBlocksProps = {
  businessName: string;
  goal: number;
  reward: string;
};

/** Six value-prop blocks for the pitch page. Data-driven, personalized. */
export function FeatureBlocks({ businessName, goal, reward }: FeatureBlocksProps) {
  return (
    <div className="flex flex-col gap-3">
      {BLOCKS.map((block) => (
        <FeatureBlock
          key={block.id}
          block={block}
          businessName={businessName}
          goal={goal}
          reward={reward}
        />
      ))}
    </div>
  );
}
