// Contract tests for the customer adapters. These assert the LOCKED FE/BE
// progress contract (plan §3): the adapters must read the field names the LIVE
// backend serializers actually emit, not the UI-domain names the typed mock
// objects use. Run with `pnpm --filter @jaqyn/api test` (node:test + native TS
// type-stripping — no extra test runner in the monorepo).

import assert from "node:assert/strict";
import { test } from "node:test";

import { adaptCampaign, adaptCampaignFeed, adaptGroupSession } from "./adapters";

// A campaign row shaped exactly like CampaignDetailSerializer, with `my_progress`
// shaped like CampaignProgressSerializer (progress_count / required_count /
// status / voucher_id — and NONE of the legacy current_count / target_count /
// joined / completed keys the old adapter relied on).
function liveCampaignRaw(myProgress: Record<string, unknown> | null): Record<string, unknown> {
  return {
    id: "c-1",
    business: "b-1",
    business_name: "Manas Coffee",
    name: "Morning Coffee Challenge",
    description: "Visit before noon",
    campaign_type: "time_window",
    status: "active",
    rule: { required_count: 3 },
    reward: { reward_type: "free_item", title: "Free croissant", description: "Any croissant" },
    my_progress: myProgress,
  };
}

test("adaptCampaignProgress maps backend progress_count -> current_count", () => {
  const c = adaptCampaign(liveCampaignRaw({ status: "in_progress", progress_count: 2, required_count: 3, voucher_id: null }));
  assert.equal(c.my_progress?.current_count, 2);
});

test("adaptCampaignProgress maps backend required_count -> target_count", () => {
  const c = adaptCampaign(liveCampaignRaw({ status: "in_progress", progress_count: 2, required_count: 3, voucher_id: null }));
  assert.equal(c.my_progress?.target_count, 3);
});

test("adaptCampaignProgress reads voucher_id for the completed-CTA deep link", () => {
  const c = adaptCampaign(
    liveCampaignRaw({ status: "completed", progress_count: 3, required_count: 3, voucher_id: "v-42" }),
  );
  assert.equal(c.my_progress?.voucher_id, "v-42");
});

test("adaptCampaignProgress derives joined/completed from status (no joined/completed fields on the wire)", () => {
  const c = adaptCampaign(
    liveCampaignRaw({ status: "completed", progress_count: 3, required_count: 3, voucher_id: "v-42" }),
  );
  assert.equal(c.my_progress?.joined, true);
  assert.equal(c.my_progress?.completed, true);
  assert.equal(c.my_progress?.status, "completed");
});

test("adaptCampaignProgress is null when the customer has not joined", () => {
  const c = adaptCampaign(liveCampaignRaw(null));
  assert.equal(c.my_progress, null);
});

test("adaptCampaignProgress still tolerates the typed-mock UI field names", () => {
  // The seeded mock Campaign objects use UI names directly; the fallback keeps
  // them working so mocks and live agree through the same adapter.
  const c = adaptCampaign(liveCampaignRaw({ status: "in_progress", current_count: 1, target_count: 5, voucher_id: null }));
  assert.equal(c.my_progress?.current_count, 1);
  assert.equal(c.my_progress?.target_count, 5);
});

// GroupSessionSerializer emits `invite_token` (not invite_code) and members as
// rows with `customer` + `status` (checked_in_at). The adapter must surface the
// token as invite_code so the jaqyn.kg/g/<code> invite link renders.
test("adaptGroupSession maps backend invite_token -> invite_code", () => {
  const s = adaptGroupSession({
    id: "gs-1",
    campaign: "c-1",
    group_leader: "u-leader",
    status: "forming",
    required_size: 4,
    invite_token: "LU-AB12C",
    members: [{ id: "m-1", customer: "u-leader", status: "joined" }],
  });
  assert.equal(s.invite_code, "LU-AB12C");
});

// campaigns-restructure design §3: campaign_type is now individual/group/social
// and an Individual campaign carries a mechanic (visit/stamp/spend).
test("adaptCampaign maps individual + spend mechanic and required_spend", () => {
  const c = adaptCampaign({
    id: "c-1",
    business: "b-1",
    name: "Spend 1000",
    campaign_type: "individual",
    status: "active",
    rule: { mechanic: "spend", required_spend: "1000.00" },
    reward: { reward_type: "custom", title: "Gift" },
    my_progress: null,
  });
  assert.equal(c.campaign_type, "individual");
  assert.equal(c.rule.mechanic, "spend");
  assert.equal(c.rule.required_spend, "1000.00");
});

test("adaptCampaign maps social type + instagram_handle", () => {
  const c = adaptCampaign({
    id: "c-2",
    business: "b-1",
    name: "Tag us",
    campaign_type: "social",
    status: "active",
    instagram_handle: "@manas",
    rule: {},
    reward: { reward_type: "custom", title: "Bonus" },
    my_progress: null,
  });
  assert.equal(c.campaign_type, "social");
  assert.equal(c.rule.mechanic, null);
  assert.equal(c.instagram_handle, "@manas");
});

test("adaptCampaign degrades legacy time_window/visit to individual", () => {
  const c = adaptCampaign({
    id: "c-3",
    business: "b-1",
    name: "Legacy",
    campaign_type: "time_window",
    status: "active",
    rule: { required_count: 3 },
    reward: { title: "Free" },
    my_progress: null,
  });
  assert.equal(c.campaign_type, "individual");
});

// campaigns-restructure design §6: feed splits into {followed, discover}.
test("adaptCampaignFeed splits followed and discover lists", () => {
  const feed = adaptCampaignFeed({
    followed: [
      {
        id: "f-1",
        business: "b-1",
        name: "Followed",
        campaign_type: "individual",
        status: "active",
        rule: { mechanic: "visit", required_count: 5 },
        reward: { title: "Free" },
        my_progress: { status: "in_progress", progress_count: 2, required_count: 5, voucher_id: null },
      },
    ],
    discover: [
      {
        id: "d-1",
        business: "b-2",
        name: "Discover",
        campaign_type: "group",
        status: "active",
        rule: { required_group_size: 3 },
        reward: { title: "20% off" },
        my_progress: null,
      },
    ],
  });
  assert.equal(feed.followed.length, 1);
  assert.equal(feed.discover.length, 1);
  assert.equal(feed.followed[0]?.my_progress?.current_count, 2);
  assert.equal(feed.discover[0]?.campaign_type, "group");
});

test("adaptCampaignFeed tolerates an empty feed", () => {
  const feed = adaptCampaignFeed({});
  assert.equal(feed.followed.length, 0);
  assert.equal(feed.discover.length, 0);
});

test("adaptGroupSession marks the leader and computes checked_in from member status", () => {
  const s = adaptGroupSession({
    id: "gs-1",
    campaign: "c-1",
    group_leader: "u-leader",
    status: "full",
    required_size: 2,
    invite_token: "LU-AB12C",
    members: [
      { id: "m-1", customer: "u-leader", status: "checked_in" },
      { id: "m-2", customer: "u-2", status: "joined" },
    ],
  });
  const leader = s.members.find((m) => m.is_leader);
  assert.equal(leader?.checked_in, true);
  assert.equal(s.joined_count, 2);
});
