import assert from "node:assert/strict";
import test from "node:test";
import { claimMessage, messageStorageKey, releaseMessage } from "../src/components/communications/message-recovery.ts";
import { matchesScope, transportResult } from "../src/lib/communications/send-policy.ts";
import { identityScopeId } from "../src/lib/core/authorization.ts";

const identity = { issuer: "https://example.test", userId: "owner", organizationId: "team-a" };
const scope = identityScopeId(identity);
const sms = { to: "+15551230111", channel: "sms", message: "Test invoice", mediaUrls: [] };
const requestId = crypto.randomUUID();

test("communication writes must match the freshly verified user and workspace", () => {
  assert.equal(matchesScope(scope, identityScopeId(identity)), true);
  for (const pin of [null, "", "bad", identityScopeId({ ...identity, organizationId: "team-b" }), identityScopeId({ ...identity, userId: "another-owner" })]) {
    assert.equal(matchesScope(pin, scope), false);
  }
});

test("an uncertain dispatch retains its exact UUID after a tab closes or reloads", async () => {
  const data = new Map<string, string>();
  function storage() {
    return { setItem: (k: string, v: string) => { data.set(k, v); }, getItem: (k: string) => data.get(k) ?? null, removeItem: (k: string) => { data.delete(k); } };
  }
  const key = await messageStorageKey(scope, sms);
  const first = claimMessage(storage(), key);
  assert.equal(first.fresh, true);
  const duplicate = claimMessage(storage(), await messageStorageKey(scope, { ...sms, message: " Test invoice " }));
  assert.deepEqual(duplicate, { fresh: false, requestId: first.requestId });
  assert.equal(data.size, 1);
  assert.ok(!JSON.stringify([...data]).includes(sms.to));
  assert.ok(!JSON.stringify([...data]).includes(sms.message));
  assert.notEqual(key, await messageStorageKey(identityScopeId({ ...identity, organizationId: "team-b" }), sms));
  assert.notEqual(key, await messageStorageKey(scope, { ...sms, channel: "whatsapp" }));
  releaseMessage(storage(), key, first.requestId, "retry-rejected");
  assert.equal(data.get(key), first.requestId);
  releaseMessage(storage(), key, crypto.randomUUID(), "confirmed");
  assert.equal(data.size, 1);
  releaseMessage(storage(), key, first.requestId, "confirmed");
  assert.equal(data.size, 0);
  data.set(key, "corrupt");
  assert.throws(() => claimMessage(storage(), key));
});

test("transport uncertainty and duplicate reservations survive error translation", () => {
  for (const [status, body] of [
    [503, { ok: false, code: "SEND_OUTCOME_UNKNOWN" }], [503, { ok: false, code: "SERVICE_UNAVAILABLE" }],
    [202, { ok: true, requestId: "wrong" }], [502, null], [409, { ok: false, code: "unknown" }],
  ] as const) assert.equal(transportResult(status, body, requestId).body.code, "SEND_OUTCOME_UNKNOWN");
  assert.equal(transportResult(409, { ok: false, code: "ALREADY_SUBMITTED" }, requestId).body.code, "REQUEST_ALREADY_SUBMITTED");
  assert.equal(transportResult(503, { ok: false, code: "MESSAGING_NOT_ENABLED" }, requestId).body.code, "PROVIDER_NOT_READY");
  assert.equal(transportResult(202, { ok: true, requestId }, requestId).body.ok, true);
});
