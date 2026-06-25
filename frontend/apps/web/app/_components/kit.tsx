"use client";

import { cn } from "@jaqyn/ui";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import type { User } from "@jaqyn/api";

// Shared visual vocabulary from Jaqyn.dc.html (warm terracotta/cream).

export function PageTitle({ children }: { children: ReactNode }) {
  return <h1 className="font-display text-2xl font-bold tracking-tight text-ink">{children}</h1>;
}

export function BackButton({ href }: { href: string }) {
  return (
    <Link
      href={href}
      aria-label="back"
      className="flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-card text-lg text-ink"
    >
      ‹
    </Link>
  );
}

/**
 * User avatar: photo → emoji in brand circle → InitialTile gradient fallback.
 * Use plain <img> (not next/image) for the photo so /media/ rewrites work.
 */
export function UserAvatar({
  user,
  size = 56,
}: {
  user: Pick<User, "avatar" | "avatar_emoji" | "name" | "phone">;
  size?: number;
}) {
  const radius = Math.round(size * 0.5); // fully round
  if (user.avatar) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={user.avatar}
        alt={user.name ?? "avatar"}
        width={size}
        height={size}
        className="flex-none object-cover"
        style={{ width: size, height: size, borderRadius: radius }}
      />
    );
  }
  if (user.avatar_emoji) {
    return (
      <div
        className="flex flex-none items-center justify-center bg-brand-gradient"
        style={{ width: size, height: size, borderRadius: radius, fontSize: size * 0.48 }}
      >
        {user.avatar_emoji}
      </div>
    );
  }
  return (
    <InitialTile
      name={user.name || user.phone}
      size={size}
      variant="gradient"
    />
  );
}

/**
 * Square tile with a business/program initial. When `image` is set (e.g. a
 * business logo at /media/...), the photo takes precedence over the initial.
 * Uses a plain <img> (not next/image) so the same-origin /media/ rewrite works.
 */
export function InitialTile({
  name,
  size = 48,
  variant = "cream",
  image,
}: {
  name: string;
  size?: number;
  variant?: "cream" | "gradient";
  image?: string | null;
}) {
  const [imgError, setImgError] = useState(false);
  const radius = Math.round(size * 0.3);
  if (image && !imgError) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={image}
        alt={name}
        width={size}
        height={size}
        className="flex-none object-cover"
        style={{ width: size, height: size, borderRadius: radius }}
        onError={() => setImgError(true)}
      />
    );
  }
  return (
    <div
      className={cn(
        "flex flex-none items-center justify-center font-display font-extrabold",
        variant === "gradient" ? "bg-brand-gradient text-brand-fg" : "bg-brand-muted text-brand",
      )}
      style={{ width: size, height: size, borderRadius: radius, fontSize: size * 0.42 }}
    >
      {name.trim().charAt(0).toUpperCase() || "?"}
    </div>
  );
}

/** iOS-style grouped list (rows hairline-separated on the line color). */
export function ListGroup({ children }: { children: ReactNode }) {
  return (
    <div className="mt-4 flex flex-col gap-px overflow-hidden rounded-2xl border border-line bg-line">
      {children}
    </div>
  );
}

export function ListRow({
  label,
  value,
  href,
  onClick,
}: {
  label: ReactNode;
  value?: ReactNode;
  href?: string;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <span className="text-sm font-semibold text-ink">{label}</span>
      <span className="flex items-center gap-1 text-sm text-subtle">
        {value}
        {(href || onClick) && <span aria-hidden>›</span>}
      </span>
    </>
  );
  const cls = "flex items-center justify-between bg-card px-4 py-3.5";
  if (href) return <Link href={href} className={cls}>{inner}</Link>;
  if (onClick) return <button onClick={onClick} className={cn(cls, "w-full text-left")}>{inner}</button>;
  return <div className={cls}>{inner}</div>;
}

/** Horizontal scroll filter chips. */
export function FilterChips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
}) {
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={cn(
            "whitespace-nowrap rounded-pill px-4 py-2 text-sm font-semibold transition",
            value === o.key ? "bg-brand text-brand-fg" : "border border-line bg-card text-subtle",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Stamp progress row: filled / pending / reward-star slots. */
export function StampRow({ current, target }: { current: number; target: number }) {
  const n = Math.max(0, target);
  if (n === 0) return null;
  const slot = "flex aspect-square w-full max-w-[52px] flex-1 items-center justify-center rounded-full";
  return (
    <div className="flex justify-center gap-2.5">
      {Array.from({ length: n }).map((_, i) => {
        const isLast = i === n - 1;
        const filled = i < current;
        if (isLast) {
          const reached = current >= n;
          return (
            <span
              key={i}
              className={cn(
                slot,
                "text-base font-bold",
                reached ? "bg-amber text-white" : "border-2 border-dashed border-amber/60 text-amber",
              )}
            >
              ★
            </span>
          );
        }
        return filled ? (
          <span key={i} className={cn(slot, "bg-brand text-xs font-bold text-brand-fg")}>✓</span>
        ) : (
          <span
            key={i}
            className={cn(slot, "border-2 border-dashed border-[#DCC9AE] text-[11px] font-bold text-[#C7B193]")}
          >
            {i + 1}
          </span>
        );
      })}
    </div>
  );
}
