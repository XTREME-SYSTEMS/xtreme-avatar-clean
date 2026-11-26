import assert from "node:assert/strict";
import test from "node:test";
import { foremanReviewAccess } from "../src/lib/foreman/review-access.ts";
import { resolveIdentity } from "../src/lib/auth/identity.ts";

const now = 1_700_000_000_000;
const issuer = "https://identity.example.test";
const session = { id: "session-a", userId: "user-a", activeOrganizationId: "workspace-a", expiresAt: new Date(now + 1000) };
const user = { id: "user-a", name: "Fixture owner", emailVerified: true };
function fixture(role: string, overrides = {}) {
  return {
    getSession: async () => ({ data: { user: { ...user, ...overrides }, session }, error: null }),
    getActiveMember: async () => ({ data: { id: "member-a", userId: "user-a", organizationId: "workspace-a", role }, error: null }),
  };
}

test("only a verified owner with a fresh matching Neon membership enters review", async () => {
  assert.equal(foremanReviewAccess(await resolveIdentity(fixture("owner"), issuer, now)), "owner");
  for (const role of ["member", "admin", "unrecognized"]) {
    assert.equal(foremanReviewAccess(await resolveIdentity(fixture(role), issuer, now)), "restricted");
  }
  assert.equal(foremanReviewAccess(await resolveIdentity(fixture("owner", {emailVerified: false}), issuer, now)), "restricted");
});
test("anonymous, missing workspace and unavailable provider fail closed", () => {
  assert.equal(foremanReviewAccess({status: "anonymous"}), "sign-in");
  assert.equal(foremanReviewAccess({status: "membership_required"}), "select-workspace");
  assert.equal(foremanReviewAccess({status: "unavailable", code: "AUTH_NOT_CONFIGURED"}), "unavailable");
});
test("expired session, disabled account and crossed workspace cannot enter review", async () => {
  assert.equal(foremanReviewAccess(await resolveIdentity(fixture("owner"), issuer, now + 1000)), "sign-in");
  assert.equal(foremanReviewAccess(await resolveIdentity(fixture("owner", {banned: true}), issuer, now)), "restricted");
  const base = fixture("owner");
  const crossed = {...base, getActiveMember: async () => {
    const member = await base.getActiveMember();
    return { ...member, data: { ...member.data, organizationId: "other-workspace" } };
  }};
  assert.equal(foremanReviewAccess(await resolveIdentity(crossed, issuer, now)), "restricted");
});
