// Business-campaign adapter tests (node:test + native TS type-stripping — no
// extra runner in the monorepo). Guards two regressions:
//   1. `image` must be adapted onto BusinessCampaign (campaign icon on the hero).
//   2. `mergeCampaignIntoDetail` must keep the tabbed detail shape when a flat
//      mutation result is merged in — writing the flat object corrupted the
//      cache and crashed the detail page ("Cannot read properties of undefined
//      (reading 'type')") on Pause/End/Duplicate/photo-change.

import assert from "node:assert/strict";
import { test } from "node:test";

import { adaptBusinessCampaign, adaptCampaignDetailTabs, mergeCampaignIntoDetail } from "./adapters";

function liveCampaignRaw(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "c-1",
    glyph: "☕",
    name: "Cold Brew",
    campaign_type: "individual",
    status: "draft",
    rule: { mechanic: "visit", required_count: 5 },
    reward: { reward_type: "free_item", title: "Free coffee" },
    ...over,
  };
}

test("adaptBusinessCampaign maps the uploaded image url (campaign icon)", () => {
  const withImage = adaptBusinessCampaign(liveCampaignRaw({ image: "https://cdn/x.webp" }));
  assert.equal(withImage.image, "https://cdn/x.webp");

  // Missing / non-string image collapses to null (no icon → glyph fallback).
  assert.equal(adaptBusinessCampaign(liveCampaignRaw()).image, null);
  assert.equal(adaptBusinessCampaign(liveCampaignRaw({ image: null })).image, null);
});

test("mergeCampaignIntoDetail keeps the tabbed shape and refreshes overview/settings", () => {
  const tabs = adaptCampaignDetailTabs({
    overview: liveCampaignRaw({ status: "active" }),
    settings: liveCampaignRaw({ status: "active" }),
    participants: [{ id: "p-1", name: "Ann" }],
    reward_usage: [],
    groups: [],
    analytics: {},
  });

  // A flat mutation result (e.g. after Pause) — the shape that used to be written
  // straight into the cache and crash the reader.
  const paused = adaptBusinessCampaign(liveCampaignRaw({ status: "paused" }));
  const merged = mergeCampaignIntoDetail(tabs, paused);

  // Throw-guard (not assert.ok) so TS narrows `merged` away from undefined.
  if (!merged) throw new Error("merge should return tabs when prev is cached");
  // Still tabbed — overview/settings are the flat campaign, other tabs preserved.
  assert.equal(merged.overview.type, "individual");
  assert.equal(merged.overview.status, "paused");
  assert.equal(merged.settings.status, "paused");
  assert.equal(merged.participants.length, 1);
  assert.equal(merged.participants[0]?.name, "Ann");
});

test("mergeCampaignIntoDetail is a no-op when nothing is cached", () => {
  const flat = adaptBusinessCampaign(liveCampaignRaw());
  assert.equal(mergeCampaignIntoDetail(undefined, flat), undefined);
});
