// Tests the post-auth landing decision. Run with `pnpm --filter @jaqyn/api test`
// style (node:test + native TS type-stripping).

import assert from "node:assert/strict";
import { test } from "node:test";

import { postAuthRoute } from "./postAuthRoute";
import type { AuthResult } from "./types";

const base: AuthResult = {
  access: "a",
  refresh: "r",
  user: {
    id: "1",
    phone: null,
    name: null,
    email: null,
    role: "customer",
    is_phone_verified: false,
    is_email_verified: false,
    avatar: null,
    avatar_emoji: "",
  },
  area: "customer",
};

test("incomplete-profile customer -> /signup/complete (highest priority)", () => {
  const r: AuthResult = { ...base, profile_completed: false, onboarding_completed: false, is_new: true };
  assert.equal(postAuthRoute(r, "/"), "/signup/complete");
});

test("complete profile, unfinished onboarding -> /onboarding", () => {
  const r: AuthResult = { ...base, profile_completed: true, onboarding_completed: false };
  assert.equal(postAuthRoute(r, "/"), "/onboarding?return=%2F");
});

test("new customer with complete profile -> /onboarding with return", () => {
  const r: AuthResult = { ...base, profile_completed: true, is_new: true };
  assert.equal(postAuthRoute(r, "/rewards"), "/onboarding?return=%2Frewards");
});

test("fully set-up customer -> return path", () => {
  const r: AuthResult = { ...base, profile_completed: true, onboarding_completed: true };
  assert.equal(postAuthRoute(r, "/rewards"), "/rewards");
});

test("business user -> business console regardless of return", () => {
  const r: AuthResult = { ...base, area: "business", profile_completed: false };
  assert.equal(postAuthRoute(r, "/"), "/business/dashboard");
});

test("staff user -> staff console", () => {
  const r: AuthResult = { ...base, area: "staff", profile_completed: false };
  assert.equal(postAuthRoute(r, "/"), "/staff");
});
