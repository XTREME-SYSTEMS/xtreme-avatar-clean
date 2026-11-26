import test from "node:test";
import assert from "node:assert/strict";
import { PROBES, assertAllowlistedProbe, evaluateProbe, remediationForFailures } from "../scripts/reliability/policy.mjs";
import { probeOnce, probeWithRetry, runAudit } from "../scripts/reliability/audit.mjs";

function reply(status, body = "", headers = {}) {
  return new Response(body, { status, headers });
}
function responseFor(spec) {
  if (spec.assertion === "html") return reply(200, "<html><title>XTREME AVATAR</title></html>", { "content-type": "text/html" });
  if (spec.assertion === "account_redirect") return reply(307, null, { location: "/account" });
  if (spec.assertion === "canonical_redirect") return reply(308, null, { location: "https://www.xtremeavatar.com/" });
  if (spec.assertion === "anonymous") return reply(200, JSON.stringify({ status: "anonymous" }),
    { "cache-control": "private, no-store", "content-type": "application/json" });
  if (spec.assertion === "denied") return reply(401, JSON.stringify({ code: "SIGN_IN_REQUIRED" }),
    { "cache-control": "private, no-store", "content-type": "application/json" });
  if (spec.assertion === "service_health") return reply(200,
    JSON.stringify({ status: "online", databaseConfigured: true, twilioConfigured: true, sendEnabled: true }),
    { "content-type": "application/json" });
  if (spec.assertion === "neon_ready") return reply(200,
    JSON.stringify({ status: "ready", database: "neon" }), { "content-type": "application/json" });
  throw new Error("unknown_fixture");
}

test("all probes are exact allowlisted HTTPS, and negative send cannot send a valid phone number", () => {
  assert.equal(PROBES.length, 9);
  PROBES.forEach(assertAllowlistedProbe);
  const negative = PROBES.find(p => p.id === "outbound_boundary");
  assert.equal(JSON.parse(negative.body).to, "NOT_A_PHONE");
  assert.throws(() => assertAllowlistedProbe({ ...PROBES[0], url: "http://127.0.0.1/admin" }), /unrecognized_probe/);
  assert.throws(() => assertAllowlistedProbe({ ...PROBES[0], id: "extra" }), /unrecognized_probe/);
});

test("healthy probe results produce one read-only receipt and no Guardian certification", async () => {
  let requests = 0;
  const fake = async (url, init) => {
    requests++;
    assert.equal(init.redirect, "manual");
    assert.equal(init.credentials, "omit");
    assert.ok(!init.headers.Authorization);
    const spec = PROBES.find(p => p.url === url && p.method === init.method);
    assert.ok(spec);
    return responseFor(spec);
  };
  const receipt = await runAudit({ fetcher: fake, attempts: 1, now: () => new Date("2026-11-26T12:00:00.000Z"), commit: "abcdef0123456" });
  assert.equal(requests, 9);
  assert.deepEqual(receipt.summary, { total: 9, pass: 9, fail: 0, unknown: 0 });
  assert.equal(receipt.remediation.status, "healthy");
  assert.equal(receipt.mutationCount, 0);
  assert.equal(receipt.guardianCertified, false);
  assert.equal(receipt.targetRepo, "XTREME-SYSTEMS/xtreme-avatar-clean");
  assert.equal(receipt.sourceCommit, "abcdef0123456");
  assert.equal(receipt.observedAt, "2026-11-26T12:00:00.000Z");
  assert.ok(!JSON.stringify(receipt).includes("session_token"));
});

test("unprotected settings or changed dashboard origin are critical release failures", () => {
  const spec = PROBES.find(p => p.id === "settings_boundary");
  const bad = evaluateProbe(spec, reply(200, "{}", { "cache-control": "private, no-store" }), "{}");
  assert.equal(bad.pass, false);
  assert.equal(remediationForFailures([{ id: spec.id, area: spec.area, result: "FAIL", code: bad.code }]).status, "critical");
  const dashboard = PROBES.find(p => p.id === "dashboard_access");
  const redirect = evaluateProbe(dashboard, reply(307, null, { location: "https://evil.example/account" }), "");
  assert.equal(redirect.pass, false);
});

test("Neon failure cannot authorize an automatic database migration", () => {
  const result = remediationForFailures([{ id: "railway_neon", area: "database", result: "FAIL", code: "NEON_READINESS_FAILED" }]);
  assert.equal(result.next, "inspect_neon_auth_database_and_railway_logs");
  assert.equal(result.selfHeal, "no_automatic_data_change");
});

test("transient failures are retried once and recorded, without any repair write", async () => {
  const spec = PROBES.find(p => p.id === "railway_health");
  let calls = 0;
  const retry = await probeWithRetry(spec, async () => {
    calls++;
    if (calls === 1) return reply(503, JSON.stringify({ status: "unavailable" }));
    return responseFor(spec);
  }, { attempts: 2, pause: async () => {} });
  assert.equal(calls, 2);
  assert.equal(retry.result, "PASS");
  assert.equal(retry.attempts, 2);
});

test("read-only transport failure stays unknown and can never claim self-healing", async () => {
  const spec = PROBES.find(p => p.id === "railway_health");
  const result = await probeOnce(spec, async () => { throw new Error("no connection"); });
  assert.equal(result.result, "UNKNOWN");
  const rem = remediationForFailures([result]);
  assert.equal(rem.selfHeal, "single_redeploy_only_if_proven_failed_and_approved_by_policy");
});

test("a mismatched canonical redirect is reported, not silently followed", async () => {
  const spec = PROBES.find(p => p.id === "apex_redirect");
  const result = await probeOnce(spec, async () => reply(308, null, { location: "https://xtreme-avatar-platform.vercel.app/" }));
  assert.equal(result.result, "FAIL");
  assert.equal(result.code, "DOMAIN_REDIRECT_MISMATCH");
});
