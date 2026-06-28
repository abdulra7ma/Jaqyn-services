"use client";

import { useBusiness, useBusinessLoyalty } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { Badge, Card } from "@jaqyn/ui";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

/** Logo tile that falls back to the business glyph/initial when the image errors. */
function BusinessLogo({ logoUrl, name, glyph }: { logoUrl: string | null; name: string; glyph?: string | null }) {
  const [imgError, setImgError] = useState(false);
  if (logoUrl && !imgError) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={logoUrl} alt={name} className="h-full w-full object-cover" onError={() => setImgError(true)} />
    );
  }
  return <>{glyph || name.charAt(0).toUpperCase()}</>;
}

/** Catalog item thumbnail that falls back to a neutral placeholder when the image errors. */
function CatalogItemThumb({ imageUrl, name }: { imageUrl: string | null; name: string }) {
  const [imgError, setImgError] = useState(false);
  if (imageUrl && !imgError) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={imageUrl} alt={name} className="h-full w-full object-cover" onError={() => setImgError(true)} />
    );
  }
  return null;
}

/** Single gallery photo cell with object-cover + onError fallback. */
function GalleryPhoto({ photo }: { photo: { id: string; image_url: string; caption: string } }) {
  const [imgError, setImgError] = useState(false);
  if (imgError) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={photo.image_url}
      alt={photo.caption || "Gallery photo"}
      className="aspect-square w-full rounded-xl object-cover"
      onError={() => setImgError(true)}
    />
  );
}
import { CustomerShell } from "../../_components/CustomerShell";
import { LoyaltyProgramRow } from "../../_components/campaigns";
import { QueryBoundary } from "../../_components/QueryBoundary";
import { ListGroup, ListRow } from "../../_components/kit";
import { isOpenNow } from "../../_lib/hours";

export default function BusinessProfilePage() {
  const t = useT();
  const { id } = useParams<{ id: string }>();
  const business = useBusiness(id);
  // The business's active loyalty programs + the viewer's state (multi-form-loyalty §2).
  const loyalty = useBusinessLoyalty(id);

  return (
    <CustomerShell title={t("nearby.title")} back="/nearby" showNav={false} hideChromeTitle>
      <QueryBoundary query={business}>
        {(b) => {
          const open = isOpenNow(b.working_hours);
          const accent = b.accent_color || "#C25E3C";
          const directions = directionsHref(b);
          return (
            <div className="flex flex-col gap-4">
              <div className="overflow-hidden rounded-[22px] border border-line bg-card shadow-card">
                <div
                  className="relative flex h-[180px] items-end justify-center p-5"
                  style={{ background: b.cover_url ? `url('${encodeURI(b.cover_url)}') center/cover` : `linear-gradient(150deg, ${accent}, ${shade(accent)})` }}
                >
                  {open !== null && (
                    <span className="absolute right-4 top-4 rounded-[12px] bg-card/95 px-3 py-1.5 text-xs font-bold text-ink shadow-card">
                      {open ? t("nearby.open") : t("nearby.closed")}
                    </span>
                  )}
                  <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-[22px] bg-card text-[38px] shadow-card">
                    <BusinessLogo logoUrl={b.logo_url ?? null} name={b.name} glyph={b.glyph} />
                  </div>
                </div>
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h1 className="font-display text-2xl font-bold leading-tight text-ink">{b.name}</h1>
                      <p className="mt-1 text-sm text-subtle">
                        {b.category}
                        {b.area ? ` · ${b.area}` : ""}
                        {b.price_level ? ` · ${b.price_level}` : ""}
                      </p>
                      {b.distance_km != null && (
                        <p className="mt-1 text-xs font-semibold text-subtle">{b.distance_km} {t("nearby.distance")}</p>
                      )}
                    </div>
                    {b.reward && <Badge tone="brand">{b.reward}</Badge>}
                  </div>

                  {b.tags && b.tags.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {b.tags.map((tag) => (
                        <span key={tag} className="rounded-pill bg-[#F4ECDF] px-3 py-1.5 text-xs font-semibold text-subtle">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    {directions && <Action href={directions}>Directions</Action>}
                    {b.phone && <Action href={`tel:${b.phone}`}>Call</Action>}
                    {b.website_url && <Action href={b.website_url}>Website</Action>}
                    {b.instagram_url && <Action href={instagramHref(b.instagram_url)}>Instagram</Action>}
                  </div>
                </div>
              </div>

              {b.description && (
                <Card><p className="text-sm leading-relaxed text-ink">{b.description}</p></Card>
              )}

              <ListGroup>
                <ListRow label={t("common.location")} value={b.address || b.area || "—"} />
                <ListRow label={t("auth.phone")} value={b.phone || "—"} />
                {b.public_email && <ListRow label="Email" value={b.public_email} />}
              </ListGroup>

              {/* Loyalty programs the customer can join/continue/redeem (slice 2).
                  Omitted entirely when the business runs none. */}
              {(loyalty.data?.length ?? 0) > 0 && (
                <section aria-labelledby="loyalty-heading">
                  <h2
                    id="loyalty-heading"
                    className="mb-2.5 px-1 font-display text-sm font-bold text-ink"
                  >
                    {t("cmp.loyalty.title")}
                  </h2>
                  <div className="flex flex-col gap-2.5">
                    {loyalty.data?.map((program) => (
                      <LoyaltyProgramRow key={program.campaign_id} program={program} />
                    ))}
                  </div>
                </section>
              )}

              {renderHours(b.working_hours) && (
                <Card>
                  <p className="mb-2 font-display text-sm font-bold text-ink">{t("business.hours")}</p>
                  {renderHours(b.working_hours)}
                </Card>
              )}

              {b.rewards && b.rewards.length > 0 && (
                <Card>
                  <p className="font-display text-sm font-bold text-ink">Loyalty rewards</p>
                  <div className="mt-3 flex flex-col gap-2">
                    {b.rewards.map((r) => (
                      <div key={r.id} className="rounded-xl bg-[#FBF7F0] p-3">
                        <div className="text-sm font-bold text-ink">{r.title}</div>
                        <div className="mt-1 text-xs font-semibold text-brand">{r.reward_description}</div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {b.group_offers && b.group_offers.length > 0 && (
                <Card>
                  <p className="font-display text-sm font-bold text-ink">Group offers</p>
                  <div className="mt-3 flex flex-col gap-2">
                    {b.group_offers.map((o) => (
                      <Link key={o.id} href="/campaigns" className="rounded-xl border border-line bg-[#FBF7F0] p-3">
                        <div className="text-sm font-bold text-ink">{o.title}</div>
                        <div className="mt-1 text-xs text-subtle">
                          {o.min_group_size}
                          {o.max_group_size ? `-${o.max_group_size}` : "+"} people · {o.time_start}-{o.time_end}
                        </div>
                        <div className="mt-1 text-xs font-semibold text-brand">{o.reward_description}</div>
                      </Link>
                    ))}
                  </div>
                </Card>
              )}

              {b.catalog_sections && b.catalog_sections.length > 0 && (
                <Card>
                  <p className="font-display text-sm font-bold text-ink">Menu & offerings</p>
                  <div className="mt-3 flex flex-col gap-4">
                    {b.catalog_sections.map((section) => (
                      <div key={section.title}>
                        <div className="mb-2 text-xs font-bold uppercase tracking-[0.05em] text-subtle">{section.title}</div>
                        <div className="flex flex-col gap-2">
                          {section.items.map((item) => (
                            <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl bg-[#FBF7F0] px-3.5 py-3">
                              {item.image_url && (
                                <div className="h-12 w-12 flex-none overflow-hidden rounded-lg bg-[#E8DDD0]">
                                  <CatalogItemThumb imageUrl={item.image_url} name={item.name} />
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-semibold text-ink">{item.name}</div>
                                {item.duration && <div className="text-xs text-subtle">{item.duration}</div>}
                              </div>
                              {item.price && <div className="flex-none text-sm font-bold text-ink">{item.price}</div>}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {b.gallery && b.gallery.length > 0 && (
                <Card>
                  <p className="font-display text-sm font-bold text-ink">Photos</p>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {b.gallery.map((photo) => (
                      <GalleryPhoto key={photo.id} photo={photo} />
                    ))}
                  </div>
                </Card>
              )}
            </div>
          );
        }}
      </QueryBoundary>
    </CustomerShell>
  );
}

function Action({ href, children }: { href: string; children: string }) {
  return (
    <a
      href={href}
      target={href.startsWith("http") ? "_blank" : undefined}
      rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
      className="flex items-center justify-center rounded-[13px] border-[1.5px] border-line bg-card px-3 py-3 text-sm font-bold text-ink"
    >
      {children}
    </a>
  );
}

function renderHours(hours: Record<string, [string, string]> | Record<string, string> | null | undefined) {
  if (!hours) return null;
  const display = (hours as Record<string, string>).display;
  if (display) return <p className="text-sm text-subtle">{display}</p>;
  const entries = Object.entries(hours).filter(([, value]) => Array.isArray(value)) as [string, [string, string]][];
  if (entries.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1 text-sm text-subtle">
      {entries.map(([day, [from, to]]) => (
        <li key={day} className="flex justify-between">
          <span className="uppercase">{day}</span>
          <span>{from}-{to}</span>
        </li>
      ))}
    </ul>
  );
}

function directionsHref(b: { latitude?: string | null; longitude?: string | null; address?: string; name: string }) {
  if (b.latitude && b.longitude) return `https://www.google.com/maps/dir/?api=1&destination=${b.latitude},${b.longitude}`;
  if (b.address) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${b.name} ${b.address}`)}`;
  return null;
}

function instagramHref(value: string) {
  if (value.startsWith("http")) return value;
  return `https://instagram.com/${value.replace(/^@/, "")}`;
}

function shade(hex: string): string {
  const clean = /^#[0-9A-Fa-f]{6}$/.test(hex) ? hex : "#C25E3C";
  const n = parseInt(clean.slice(1), 16);
  const r = Math.max(0, ((n >> 16) & 255) - 30);
  const g = Math.max(0, ((n >> 8) & 255) - 30);
  const b = Math.max(0, (n & 255) - 30);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}
