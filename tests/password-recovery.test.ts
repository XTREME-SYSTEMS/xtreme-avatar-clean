import test from "node:test";
import assert from "node:assert/strict";
import { requestPasswordRecovery, confirmPasswordRecovery } from "../src/lib/auth/password-recovery.ts";

const config = { baseUrl: "https://managed-neon.example.test/neondb/auth", appOrigin: "https://clean-avatar.example.test" };
test("recovery requests use only the fixed provider and redirect", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetcher: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return Response.json({ status: true }, { status: 200 });
  };
  const r = await requestPasswordRecovery(config, { email: " user@example.test " }, fetcher);
  assert.deepEqual(r, { ok: true, status: 200 });
  assert.equal(calls[0]?.url, `${config.baseUrl}/request-password-reset`);
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), { email: "user@example.test", redirectTo: `${config.appOrigin}/reset-password` });
  assert.equal(new Headers(calls[0]?.init?.headers).has("Cookie"), false);
  assert.equal(calls[0]?.init?.redirect, "error");
});
test("unknown account provider denials do not enumerate accounts", async () => {
  const r = await requestPasswordRecovery(config, { email: "unknown@example.test" }, async () => Response.json({ code: "USER_NOT_FOUND" }, { status: 400 }));
  assert.deepEqual(r, { ok: true, status: 200 });
});
test("unsupported or unavailable provider is never called success", async () => {
  for (const status of [404, 405, 500, 503]) {
    const r = await requestPasswordRecovery(config, { email: "a@example.test" }, async () => Response.json({}, { status }));
    assert.equal(r.ok, false); assert.equal(r.code, "RECOVERY_UNAVAILABLE");
  }
});
test("invalid data never reaches provider", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => { calls++; return Response.json({}); };
  for (const data of [{ email: "" }, { email: "not-an-email" }, { email: "a@example.test", userId: "admin" }, null]) {
    assert.equal((await requestPasswordRecovery(config, data, fetcher)).status, 400);
  }
  for (const data of [{ newPassword: "12345678", token: "short" }, { newPassword: "short", token: "valid-token-1" }, { newPassword: "12345678", token: "valid-token-1", userId: "other" }]) {
    assert.equal((await confirmPasswordRecovery(config, data, fetcher)).status, 400);
  }
  assert.equal(calls, 0);
});
test("reset forwards only exact token and new password, never session cookies", async () => {
  let received: Record<string, unknown> = {};
  const r = await confirmPasswordRecovery(config, { token: "valid-token-123", newPassword: "anewprivatepassword" }, async (url, init) => {
    assert.equal(String(url), `${config.baseUrl}/reset-password`);
    assert.equal(new Headers(init?.headers).has("Cookie"), false);
    received = JSON.parse(String(init?.body));
    return Response.json({ status: true }, { status: 200 });
  });
  assert.deepEqual(received, { token: "valid-token-123", newPassword: "anewprivatepassword" });
  assert.deepEqual(r, { ok: true, status: 200 });
});
test("invalid expired and rate-limited reset replies remain failures", async () => {
  for (const [status, code] of [[400, "RESET_LINK_INVALID_OR_EXPIRED"], [401, "RESET_LINK_INVALID_OR_EXPIRED"], [429, "RECOVERY_RATE_LIMITED"], [503, "RECOVERY_UNAVAILABLE"]] as const) {
    const r = await confirmPasswordRecovery(config, { token: "valid-token-123", newPassword: "anewprivatepassword" }, async () => Response.json({}, { status }));
    assert.deepEqual({ ok: r.ok, code: r.code }, { ok: false, code });
  }
});
