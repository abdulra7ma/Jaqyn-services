// Contract tests for the customer adapters. These assert the LOCKED FE/BE
// progress contract (plan §3): the adapters must read the field names the LIVE
// backend serializers actually emit, not the UI-domain names the typed mock
// objects use. Run with `pnpm --filter @jaqyn/api test` (node:test + native TS
// type-stripping — no extra test runner in the monorepo).

import assert from "node:assert/strict";
import { test } from "node:test";

import { adaptCampaign, adaptGroupSession } from "./adapters";

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
