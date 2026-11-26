import test from "node:test";
import assert from "node:assert/strict";
import { accountFocusAction, SIGN_UP_UNCERTAIN_MESSAGE } from "../src/lib/auth/account-focus.ts";

test("returning from a password manager preserves an idle anonymous account form", () => {
  assert.equal(accountFocusAction("anonymous", null), "refresh-draft");
});

test("focus interrupts an in-flight registration with uncertainty instead of treating it as an idle draft", () => {
  // An action can start after the focus listener was installed: use the latest pending snapshot.
  const status = "anonymous";
  assert.equal(accountFocusAction(status, null), "refresh-draft");
  assert.equal(accountFocusAction(status, "sign-up"), "interrupt-signup");
  assert.match(SIGN_UP_UNCERTAIN_MESSAGE, /could not confirm/);
  assert.match(SIGN_UP_UNCERTAIN_MESSAGE, /signing in.*before submitting another/);
});

test("scoped, denied and unknown sessions still invalidate before a focus refresh", () => {
  for (const status of ["authenticated", "membership_required", "access_denied", "unavailable", "loading"]) {
    assert.equal(accountFocusAction(status, null), "invalidate");
  }
});

test("other pending authentication and workspace actions retain hard invalidation", () => {
  for (const pending of ["sign-in", "google", "sign-out", "organization", "create-organization"]) {
    assert.equal(accountFocusAction("anonymous", pending), "invalidate");
    assert.equal(accountFocusAction("authenticated", pending), "invalidate");
  }
});
