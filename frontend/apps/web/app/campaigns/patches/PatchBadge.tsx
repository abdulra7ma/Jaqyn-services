"use client";

/**
 * PatchBadge — SVG patch visual ported 1:1 from dcscript-1.js patchSVG().
 *
 * Props mirror the dcscript arg list:
 *   shape   — circle | shield | hexagon | banner
 *   colors  — { light, color, deep } — raw hex from backend PatchOut (brand data,
 *             not design-system tokens — inline style is correct here per spec).
 *   icon    — key into the ICONS registry (star, layers, coffee, …)
 *   size    — rendered width + height in px
 *   locked  — dashed outline variant (no gradient)
 *   shadow  — soft | flat | none (filter)
 *
 * The icon registry and shape paths are ported VERBATIM from dcscript-1.js
 * ICONS{} and SHAPES{} tables.
 */

import type { PatchShape } from "@jaqyn/api";
import type { CSSProperties } from "react";

// ---- Shape paths (SHAPES{} from dcscript-1.js, verbatim) ----------------------

const SHAPES: Record<PatchShape, { d: string; cx: number; cy: number }> = {
  circle: { d: "M50 5 A45 45 0 1 1 49.99 5 Z", cx: 50, cy: 50 },
  shield: {
    d: "M17 16 Q17 9 24 9 H76 Q83 9 83 16 V50 Q83 75 50 92 Q17 75 17 50 Z",
    cx: 50,
    cy: 46,
  },
  hexagon: { d: "M50 5 L89 27.5 V72.5 L50 95 L11 72.5 V27.5 Z", cx: 50, cy: 50 },
  banner: {
    d: "M19 10 H81 Q88 10 88 17 V70 L69 82 L50 72 L31 82 L12 70 V17 Q12 10 19 10 Z",
    cx: 50,
    cy: 43,
  },
};

// ---- Shadow filter (SHADOW{} from dcscript-1.js, verbatim) --------------------

const SHADOW: Record<"soft" | "flat" | "none", string> = {
  soft: "drop-shadow(0 5px 9px rgba(46,36,29,.22))",
  flat: "drop-shadow(0 2px 4px rgba(46,36,29,.15))",
  none: "none",
};

// ---- Icon registry (ICONS{} from dcscript-1.js, verbatim) --------------------
// Each entry is an array of [element, attrs] tuples, exactly as in the source.

type IconEl = ["path" | "polyline" | "polygon" | "circle" | "rect", Record<string, unknown>];
type IconDef = IconEl[];

const ICONS: Record<string, IconDef> = {
  star: [
    [
      "path",
      {
        d: "M12 2.2l2.9 6.05 6.6.62-4.98 4.4 1.48 6.48L12 16.9l-6 3.45 1.48-6.48L2.5 8.87l6.6-.62z",
        fill: "currentColor",
        stroke: "none",
      },
    ],
  ],
  layers: [
    ["polygon", { points: "12 2.5 2.5 7.5 12 12.5 21.5 7.5" }],
    ["polyline", { points: "2.5 12.5 12 17.5 21.5 12.5" }],
    ["polyline", { points: "2.5 17 12 22 21.5 17" }],
  ],
  coffee: [
    ["path", { d: "M18 8h1a4 4 0 0 1 0 8h-1" }],
    ["path", { d: "M4 8h14v8a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8z" }],
    ["path", { d: "M7 2v2.5M11 2v2.5M15 2v2.5" }],
  ],
  sunrise: [
    ["path", { d: "M17 18a5 5 0 0 0-10 0" }],
    ["path", { d: "M12 9V3" }],
    ["path", { d: "M8 6l4-4 4 4" }],
    ["path", { d: "M4 18h1M19 18h1M6.3 11.7l.7.7M17 12.4l.7-.7" }],
    ["path", { d: "M2 22h20" }],
  ],
  users: [
    ["path", { d: "M17 21v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V21" }],
    ["circle", { cx: 9.5, cy: 7, r: 3.4 }],
    ["path", { d: "M22 21v-1.5a4 4 0 0 0-3-3.85" }],
    ["path", { d: "M16.5 3.6a3.4 3.4 0 0 1 0 6.6" }],
  ],
  repeat: [
    ["polyline", { points: "17 1.5 21 5.5 17 9.5" }],
    ["path", { d: "M3 11.5v-1a4 4 0 0 1 4-4h14" }],
    ["polyline", { points: "7 22.5 3 18.5 7 14.5" }],
    ["path", { d: "M21 12.5v1a4 4 0 0 1-4 4H3" }],
  ],
  heart: [
    [
      "path",
      {
        d: "M20.8 5.1a5.2 5.2 0 0 0-7.4 0L12 6.5l-1.4-1.4a5.2 5.2 0 1 0-7.4 7.4l1.4 1.4L12 21.4l7.4-7.5 1.4-1.4a5.2 5.2 0 0 0 0-7.4z",
        fill: "currentColor",
        stroke: "none",
      },
    ],
  ],
  compass: [
    ["circle", { cx: 12, cy: 12, r: 9 }],
    ["polygon", { points: "15.6 8.4 13.8 13.8 8.4 15.6 10.2 10.2", fill: "currentColor", stroke: "none" }],
  ],
  crown: [
    ["path", { d: "M3 8l3.5 3L12 5l5.5 6L21 8l-1.8 10H4.8L3 8z" }],
    ["path", { d: "M4.8 18h14.4" }],
  ],
  moon: [
    [
      "path",
      {
        d: "M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z",
        fill: "currentColor",
        stroke: "none",
      },
    ],
  ],
  gift: [
    ["polyline", { points: "20 12 20 21.5 4 21.5 4 12" }],
    ["rect", { x: 2.5, y: 7, width: 19, height: 5, rx: 1 }],
    ["path", { d: "M12 21.5V7" }],
    ["path", { d: "M12 7H7.8a2.4 2.4 0 0 1 0-4.8C11 2.2 12 7 12 7z" }],
    ["path", { d: "M12 7h4.2a2.4 2.4 0 0 0 0-4.8C13 2.2 12 7 12 7z" }],
  ],
  droplet: [
    [
      "path",
      {
        d: "M12 2.7l5.6 5.6a8 8 0 1 1-11.2 0z",
        fill: "currentColor",
        stroke: "none",
      },
    ],
  ],
  zap: [
    [
      "path",
      {
        d: "M13 2L3.5 13.5H11l-1 8.5 9.5-11.5H12l1-8.5z",
        fill: "currentColor",
        stroke: "none",
      },
    ],
  ],
  pin: [
    ["path", { d: "M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" }],
    ["circle", { cx: 12, cy: 10, r: 2.6 }],
  ],
};

// ---- Component ----------------------------------------------------------------

export type PatchColors = {
  light: string;
  color: string;
  deep: string;
};

export interface PatchBadgeProps {
  shape: PatchShape;
  colors: PatchColors;
  icon: string;
  size: number;
  locked?: boolean;
  shadow?: "soft" | "flat" | "none";
}

/**
 * Renders the patch SVG. Colors come from API data (brand hexes) — inline style
 * is correct here. The chrome (outline, stitch ring) uses spec-literal values
 * (#F6EFE1 cream edge, #CDB99C locked outline) from the design doc, not tokens.
 */
export function PatchBadge({
  shape,
  colors,
  icon,
  size,
  locked = false,
  shadow = "soft",
}: PatchBadgeProps): JSX.Element {
  const S = SHAPES[shape] ?? SHAPES.circle;
  // Icon scale and position: dcscript-1.js iscale=1.62, ix/iy from cx/cy.
  const iscale = 1.62;
  const ix = S.cx - (24 * iscale) / 2;
  const iy = S.cy - (24 * iscale) / 2;

  const iconColor = locked ? "#BBA588" : "#fff";
  const filterStyle: CSSProperties = { filter: SHADOW[shadow ?? "soft"] };

  // Icon group — same transforms as dcscript-1.js
  const iconGroup = (
    <g
      transform={`translate(${ix} ${iy}) scale(${iscale})`}
      fill="none"
      stroke={iconColor}
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ color: iconColor }}
    >
      {(ICONS[icon] ?? (ICONS["star"] as IconDef)).map((el, i) => {
        // Explicit index access avoids the TS2532 "possibly undefined" on tuple destructuring.
        const Tag = el[0];
        const attrs = el[1];
        if (Tag === undefined || attrs === undefined) return null;
        // TypeScript needs the tag to be a known SVG element.
        if (Tag === "path") {
          return (
            <path
              key={i} // eslint-disable-line react/no-array-index-key
              {...(attrs as React.SVGProps<SVGPathElement>)}
            />
          );
        }
        if (Tag === "polyline") {
          return (
            <polyline
              key={i} // eslint-disable-line react/no-array-index-key
              {...(attrs as React.SVGProps<SVGPolylineElement>)}
            />
          );
        }
        if (Tag === "polygon") {
          return (
            <polygon
              key={i} // eslint-disable-line react/no-array-index-key
              {...(attrs as React.SVGProps<SVGPolygonElement>)}
            />
          );
        }
        if (Tag === "circle") {
          return (
            <circle
              key={i} // eslint-disable-line react/no-array-index-key
              {...(attrs as React.SVGProps<SVGCircleElement>)}
            />
          );
        }
        if (Tag === "rect") {
          return (
            <rect
              key={i} // eslint-disable-line react/no-array-index-key
              {...(attrs as React.SVGProps<SVGRectElement>)}
            />
          );
        }
        return null;
      })}
    </g>
  );

  if (locked) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        style={filterStyle}
        aria-hidden
      >
        <path
          d={S.d}
          fill="rgba(255,255,255,.26)"
          stroke="#CDB99C"
          strokeWidth={2.3}
          strokeDasharray="4 4"
          strokeLinejoin="round"
        />
        {iconGroup}
      </svg>
    );
  }

  // Gradient id: derived from color values — unique per color combination.
  const gid = `pg${(colors.light + colors.color + colors.deep).replace(/[#\s]/g, "")}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      style={filterStyle}
      aria-hidden
    >
      <defs>
        <radialGradient id={gid} cx="0.36" cy="0.3" r="0.9">
          <stop offset="0%" stopColor={colors.light} />
          <stop offset="60%" stopColor={colors.color} />
          <stop offset="100%" stopColor={colors.deep} />
        </radialGradient>
      </defs>
      {/* Base fill with cream merrow edge stroke #F6EFE1 4.5px per spec. */}
      <path
        d={S.d}
        fill={`url(#${gid})`}
        stroke="#F6EFE1"
        strokeWidth={4.5}
        strokeLinejoin="round"
      />
      {/* Inset dashed stitch ring: scale 0.82, white at .72 opacity. */}
      <path
        d={S.d}
        fill="none"
        stroke="rgba(255,255,255,.72)"
        strokeWidth={1.5}
        strokeDasharray="3 3.4"
        strokeLinejoin="round"
        transform="translate(9 9) scale(0.82)"
      />
      {iconGroup}
    </svg>
  );
}
