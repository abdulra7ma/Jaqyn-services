import type { CSSProperties } from 'react';

// Configurable props mirror the prototype's editor props.
export const ACCENT = '#C25E3C';
export const ACCENT_DEEP = '#A2492A';

// Style helpers ported from the prototype's DCLogic methods.
export function avatar(bg: string, fg: string): CSSProperties {
  return {
    width: 34,
    height: 34,
    borderRadius: '50%',
    background: bg,
    color: fg,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    font: "700 13px 'Hanken Grotesk', sans-serif",
    border: '2.5px solid #FBF6EE',
    marginLeft: -9,
  };
}

export function smallAvatar(bg: string, fg: string): CSSProperties {
  return {
    width: 28,
    height: 28,
    borderRadius: '50%',
    background: bg,
    color: fg,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    font: "700 11px 'Hanken Grotesk', sans-serif",
    border: '2px solid #fff',
    marginLeft: -7,
  };
}

export function iconTile(bg: string, color: string): CSSProperties {
  return {
    width: 46,
    height: 46,
    borderRadius: 14,
    background: bg,
    color,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    font: "800 20px 'Bricolage Grotesque', sans-serif",
  };
}
