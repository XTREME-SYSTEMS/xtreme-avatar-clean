import test from "node:test";
import assert from "node:assert/strict";
import { dashboardDestination } from "../src/lib/auth/account-navigation.ts";

test("only authenticated sessions with a verified active workspace route to dashboard", () => {
  assert.equal(dashboardDestination({ status: "authenticated", organization: { id: "workspace-1", role: "owner" } }), "/dashboard");
  assert.equal(dashboardDestination({ status: "authenticated", organization: { id: "workspace-2", role: "member" } }), "/dashboard");
  assert.equal(dashboardDestination({ status: "authenticated" }), null);
  assert.equal(dashboardDestination({ status: "membership_required" }), null);
  assert.equal(dashboardDestination({ status: "anonymous" }), null);
  assert.equal(dashboardDestination({ status: "access_denied" }), null);
  assert.equal(dashboardDestination({ status: "unavailable" }), null);
  assert.equal(dashboardDestination(undefined), null);
});
