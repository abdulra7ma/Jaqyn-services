"use client";

/**
 * Pure CSS confetti — 34 deterministic absolutely-positioned pieces.
 * Per-piece duration (1.1–2.2s) and delay (0–0.9s) derived from index math
 * to produce visual randomness without a library or Math.random().
 *
 * Two modes:
 *   • `loop=false` (default) — win overlay: `jq-confetti` forwards (pieces fall once).
 *   • `loop=true` — earn-moment: `jq-confetti-loop` infinite.
 *
 * Caller is responsible for gating on `useReducedMotion()` — when reduced motion
 * is preferred, don't render this component at all.
 */

// 34 pieces as per mockup-spec.md.
const PIECE_COUNT = 34;

// Palette: brand palette accents. Kept as raw hex because confetti is data-driven
// (not themed — it's a celebratory overlay, not a UI primitive).
const COLORS = [
  "#C25E3C", // terracotta
  "#E7A23E", // amber
  "#5E8B6A", // sage
  "#9D4E7C", // plum
  "#4E6B9D", // indigo
  "#FBEFD9", // cream
];

// Shapes: circles and rectangles alternate.
const SHAPES = ["circle" as const, "rect" as const];

interface PieceProps {
  index: number;
  loop: boolean;
}

function ConfettiPiece({ index, loop }: PieceProps) {
  // Deterministic pseudo-random spread using prime-multiplied index math.
  // All values are bounded to known ranges — no Math.random().
  const left = ((index * 31 + 7) % 97) + 1; // 2–97% horizontal
  const size = 6 + (index % 5) * 2; // 6–14px
  const colorIdx = index % COLORS.length;
  const shapeIdx = index % SHAPES.length;
  const shape = SHAPES[shapeIdx];
  // Duration spread: 1.1s to 2.2s over 34 pieces.
  const duration = 1.1 + (index / (PIECE_COUNT - 1)) * 1.1;
  // Delay spread: 0s to 0.9s.
  const delay = (index / (PIECE_COUNT - 1)) * 0.9;

  const animClass = loop ? "animate-jq-confetti-loop" : "animate-jq-confetti";

  return (
    <span
      aria-hidden
      className={`absolute top-0 ${animClass}`}
      style={{
        left: `${left}%`,
        width: size,
        height: shape === "rect" ? size * 0.5 : size,
        borderRadius: shape === "circle" ? "50%" : "2px",
        backgroundColor: COLORS[colorIdx],
        animationDuration: `${duration.toFixed(2)}s`,
        animationDelay: `${delay.toFixed(2)}s`,
        // Slight per-piece horizontal offset for spread.
        transform: `rotate(${(index * 13) % 360}deg)`,
      }}
    />
  );
}

interface ConfettiProps {
  /** When true, animation loops (earn-moment). Default: false (win overlay, forwards). */
  loop?: boolean;
}

export function Confetti({ loop = false }: ConfettiProps) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {Array.from({ length: PIECE_COUNT }).map((_, i) => (
        // eslint-disable-next-line react/no-array-index-key -- purely positional, no identity
        <ConfettiPiece key={i} index={i} loop={loop} />
      ))}
    </div>
  );
}
