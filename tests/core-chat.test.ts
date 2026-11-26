import test from "node:test";
import assert from "node:assert/strict";
import { createPublicKey, generateKeyPairSync, verify } from "node:crypto";
import { createCoreAuthorization, CORE_ORIGIN, NEON_ISSUER, CHAT_SCOPES, identityScopeId } from "../src/lib/core/authorization.ts";
import { BodyLimitError, BodyTimeoutError, parseChatInput, parseChatTurn, parseChatHistory, readBoundedJson } from "../src/lib/core/contracts.ts";
import { callCoreChat } from "../src/lib/core/transport.ts";
import { handleChatRequest } from "../src/lib/core/handler.ts";

const now = Math.floor(Date.now() / 1000);
const origin = "https://avatar-preview.example.com";
const key = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;
const identity = {
  issuer: NEON_ISSUER, userId: "11111111-1111-4111-8111-111111111111", sessionId: "session_one",
  sessionExpiresAt: new Date((now + 3600) * 1000).toISOString(), organizationId: "22222222-2222-4222-8222-222222222222",
  memberId: "33333333-3333-4333-8333-333333333333", role: "owner",
};
const binding = {
  issuer: NEON_ISSUER, neonUserId: identity.userId, neonOrganizationId: identity.organizationId, neonMemberId: identity.memberId,
  neonRole: "owner", coreUserId: "44444444-4444-4444-8444-444444444444", coreTenantId: "55555555-5555-4555-8555-555555555555",
  approvalRef: "test-only:synthetic-binding", expiresAt: new Date((now + 1800) * 1000).toISOString(),
};
const env = {
  CORE_CHAT_ENABLED: "true", CORE_API_BASE_URL: CORE_ORIGIN, CORE_AUTH_ISSUER: origin, AVATAR_APP_ORIGIN: origin,
  CORE_AUTH_AUDIENCE: "test:core-chat", CORE_AUTH_CLIENT_ID: "synthetic-client", CORE_AUTH_KEY_ID: "synthetic-key",
  CORE_AUTH_PRIVATE_KEY: key.export({ type: "pkcs8", format: "pem" }).toString(),
  CORE_IDENTITY_BINDINGS_JSON: JSON.stringify({ version: 1, bindings: [binding] }),
};
const input = { text: "Test message", requestKey: "original_request_key_1" };
const completed = {
  id: "turn_one", status: "completed", text: "Synthetic answer", providerResponseId: "resp_synthetic", usage: { routed: { model: "fixture" } },
  errorCode: null, createdAt: new Date().toISOString(), profileRevision: 1,
};
const pending = { ...completed, status: "pending", text: null, providerResponseId: null, usage: null };
const configWith = (bindings: unknown[]) => ({ ...env, CORE_IDENTITY_BINDINGS_JSON: JSON.stringify({ version: 1, bindings }) });
const mockFetch = (fn: (url: string | URL | Request, init?: RequestInit) => Response | Promise<Response>) => fn as typeof fetch;

test("delegation is disabled by default and cannot use a generic static owner token", () => {
  assert.equal(createCoreAuthorization(identity, { CORE_TOKEN: "not_accepted" }, now).status, "not_connected");
  assert.equal(createCoreAuthorization(identity, { ...env, CORE_CHAT_ENABLED: "false" }, now).status, "not_connected");
});

test("valid explicitly mapped identity gets verifiable 60-second RS256 owner token with fixed scopes", () => {
  const result = createCoreAuthorization(identity, env, now);
  assert.equal(result.status, "ready");
  if (result.status !== "ready") return;
  const [header, claims, signature] = result.token.split(".");
  assert.deepEqual(JSON.parse(Buffer.from(header, "base64url").toString()), { alg: "RS256", typ: "at+jwt", kid: "synthetic-key" });
  const payload = JSON.parse(Buffer.from(claims, "base64url").toString());
  assert.equal(payload.sub, binding.coreUserId); assert.equal(payload.tenant_id, binding.coreTenantId);
  assert.equal(payload.scope, CHAT_SCOPES); assert.ok(!payload.scope.includes("memory:"));
  assert.equal(payload.iss, origin); assert.equal(payload.aud, env.CORE_AUTH_AUDIENCE);
  assert.equal(payload.exp - payload.iat, 60); assert.deepEqual(payload.roles, ["owner"]);
  assert.equal(verify("RSA-SHA256", Buffer.from(`${header}.${claims}`), createPublicKey(key), Buffer.from(signature, "base64url")), true);
  const second = createCoreAuthorization(identity, env, now);
  assert.equal(second.status, "ready"); if (second.status === "ready") assert.notEqual(result.token, second.token);
});

test("revoked/expired, foreign user, organization, membership and downgraded role cannot mint", () => {
  for (const changed of [
    { userId: "66666666-6666-4666-8666-666666666666" }, { organizationId: "77777777-7777-4777-8777-777777777777" },
    { memberId: "88888888-8888-4888-8888-888888888888" }, { role: "member" },
    { issuer: "https://foreign.example.com/auth" }, { sessionExpiresAt: new Date((now - 1) * 1000).toISOString() },
  ]) assert.equal(createCoreAuthorization({ ...identity, ...changed }, env, now).status, "access_denied");
  assert.equal(createCoreAuthorization(identity, configWith([{ ...binding, expiresAt: new Date((now - 1) * 1000).toISOString() }]), now).status, "access_denied");
});

test("token cannot outlive either approved mapping or live session", () => {
  const result = createCoreAuthorization({ ...identity, sessionExpiresAt: new Date((now + 12) * 1000).toISOString() }, env, now);
  assert.equal(result.status, "ready");
  if (result.status === "ready") assert.equal(JSON.parse(Buffer.from(result.token.split(".")[1], "base64url").toString()).exp, now + 12);
});

test("ambiguous source or reverse-target mappings and unsupported fields are rejected", () => {
  for (const bindings of [
    [binding, { ...binding, neonMemberId: "99999999-9999-4999-8999-999999999999" }],
    [binding, { ...binding, neonUserId: "99999999-9999-4999-8999-999999999999" }],
    [{ ...binding, scope: "memory:read" }],
    [{ ...binding, coreUserId: "ABCDEF12-4444-4444-8444-444444444444" }],
    [{ ...binding, coreUserId: "44444444-4444-0444-8444-444444444444" }],
  ]) assert.equal(createCoreAuthorization(identity, configWith(bindings), now).status, "not_connected");
});

test("bad origin/audience/client, incorrect Core target, weak or wrong algorithm keys fail closed", () => {
  const weak = generateKeyPairSync("rsa", { modulusLength: 1024 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const ed = generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  for (const changed of [
    { CORE_AUTH_AUDIENCE: "*" }, { CORE_AUTH_CLIENT_ID: " " }, { CORE_AUTH_KEY_ID: "bad kid" },
    { CORE_AUTH_ISSUER: "http://avatar-preview.example.com" }, { CORE_AUTH_ISSUER: origin + ":8443", AVATAR_APP_ORIGIN: origin + ":8443" },
    { CORE_API_BASE_URL: "https://other.example.com" }, { CORE_AUTH_PRIVATE_KEY: weak }, { CORE_AUTH_PRIVATE_KEY: ed },
  ]) assert.equal(createCoreAuthorization(identity, { ...env, ...changed }, now).status, "not_connected");
});

test("strict chat contract rejects arbitrary fields and measures UTF-8 body bytes", () => {
  assert.deepEqual(parseChatInput({ ...input, text: "  hello  " }), { ...input, text: "hello" });
  assert.equal(parseChatInput({ ...input, tenant_id: binding.coreTenantId }), null);
  assert.equal(parseChatInput({ ...input, requestKey: "short" }), null);
  assert.equal(parseChatInput({ ...input, text: "a".repeat(5001) }), null);
  assert.ok(parseChatInput({ ...input, text: "\u0800".repeat(5000) }));
  assert.equal(parseChatInput({ ...input, text: "\u0000".repeat(4000) }), null);
  assert.equal(parseChatTurn(completed)?.status, "completed");
  assert.equal(parseChatTurn(pending)?.status, "pending");
  assert.equal(parseChatTurn({ ...pending, text: "unverified answer" }), null);
  assert.equal(parseChatTurn({ ...completed, profileRevision: "1" }), null);
  assert.equal(parseChatHistory({ messages: Array(31).fill({ ...completed, input: "x" }) }), null);
});

test("fixed transport sends only two fields and preserves the exact key across retry/readback", async () => {
  const bodies: string[] = [];
  const fetcher = mockFetch((url, init) => {
    assert.equal(url, CORE_ORIGIN + "/v1/chat"); assert.equal(init?.redirect, "error"); assert.equal(init?.cache, "no-store");
    assert.equal(new Headers(init?.headers).has("cookie"), false);
    bodies.push(String(init?.body)); return Response.json(pending);
  });
  for (let n = 0; n < 2; n++) assert.equal((await callCoreChat({ token: "test", origin: CORE_ORIGIN, fetch: fetcher }, input)).kind, "turn");
  assert.deepEqual(bodies, [JSON.stringify(input), JSON.stringify(input)]);
});

test("transport never labels HTTP200 pending/unknown as completed", async () => {
  for (const status of ["pending", "unknown", "failed"]) {
    const result = await callCoreChat({ token: "test", origin: CORE_ORIGIN, fetch: mockFetch(() => Response.json({ ...pending, status })) }, input);
    assert.equal(result.kind, "turn"); if (result.kind === "turn") assert.equal(result.turn.status, status);
  }
});

test("lost response causes one attempt and an honest unknown, never a new dispatch", async () => {
  let calls = 0;
  const result = await callCoreChat({ token: "test", origin: CORE_ORIGIN, fetch: mockFetch(() => { calls++; throw new Error("synthetic network loss"); }) }, input);
  assert.equal(calls, 1); assert.equal(result.kind, "error"); if (result.kind === "error") assert.equal(result.state, "unknown");
});

test("Core403 includes idempotency conflict and is kept as denied; upstream details are never relayed", async () => {
  for (const status of [401, 403]) {
    const result = await callCoreChat({ token: "test", origin: CORE_ORIGIN, fetch: mockFetch(() => Response.json({ private: "do not expose" }, { status })) }, input);
    assert.equal(result.kind, "error"); if (result.kind === "error") assert.equal(result.state, "access_denied");
    assert.ok(!JSON.stringify(result).includes("do not expose"));
  }
});

test("response bodies are cancelled on unsupported content type and oversized advertised length", async () => {
  let cancelled = 0;
  const stream = () => new ReadableStream({ cancel() { cancelled++; } });
  await callCoreChat({ token: "test", origin: CORE_ORIGIN, fetch: mockFetch(() => new Response(stream(), { headers: { "content-type": "text/html" } })) }, input);
  await assert.rejects(readBoundedJson(new Response(stream(), { headers: { "content-length": "99999" } }), 128), BodyLimitError);
  assert.equal(cancelled, 2);
});

test("chunked oversized bodies and stalled uploads are bounded and cancelled", async () => {
  let cancelled = false;
  const large = new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode("x".repeat(256))); }, cancel() { cancelled = true; } }));
  await assert.rejects(readBoundedJson(large, 128), BodyLimitError); assert.equal(cancelled, true);
  await assert.rejects(readBoundedJson(new Response(new ReadableStream()), 128, 10), BodyTimeoutError);
});

function request(body = { ...input, scopeId: identityScopeId(identity) }, requestOrigin = origin) {
  return new Request(origin + "/api/eden/chat", { method: "POST", headers: { "content-type": "application/json", origin: requestOrigin }, body: JSON.stringify(body) });
}

test("route denies cross-origin and stale-account bodies before upstream and checks session after upload", async () => {
  let identityReads = 0; let providerCalls = 0;
  const deps = { env, getIdentity: async () => { identityReads++; return { status: "authenticated" as const, identity }; }, fetch: mockFetch(() => { providerCalls++; return Response.json(completed); }) };
  assert.equal((await handleChatRequest(request(undefined, "https://foreign.example.com"), deps)).status, 403);
  assert.equal(identityReads, 0);
  assert.equal((await handleChatRequest(request({ ...input, scopeId: "old_account" }), deps)).status, 403);
  assert.equal(providerCalls, 0);
  const r = await handleChatRequest(request(), deps); assert.equal(r.status, 200);
  assert.equal(r.headers.get("cache-control"), "private, no-store, max-age=0");
  assert.equal(providerCalls, 1);
  const data = await r.json(); assert.equal(data.kind, "turn"); assert.ok(!JSON.stringify(data).includes("Bearer"));
});

test("revoked session and foreign membership deny route without any Core call", async () => {
  for (const status of ["anonymous", "access_denied", "membership_required"] as const) {
    let calls = 0;
    const response = await handleChatRequest(request(), { env, getIdentity: async () => ({ status }), fetch: mockFetch(() => { calls++; return Response.json(completed); }) });
    assert.equal(response.status, status === "anonymous" ? 401 : 403); assert.equal(calls, 0);
  }
});

test("authenticated history is recovered from Core; missing bridge stays honest", async () => {
  const req = () => new Request(origin + "/api/eden/chat");
  const getIdentity = async () => ({ status: "authenticated" as const, identity });
  const result = await handleChatRequest(req(), { env, getIdentity, fetch: mockFetch(() => Response.json({ messages: [{ ...completed, input: "previous message" }] })) });
  assert.equal(result.status, 200); assert.equal((await result.json()).messages[0].input, "previous message");
  const blocked = await handleChatRequest(req(), { env: { AVATAR_APP_ORIGIN: origin }, getIdentity });
  assert.equal(blocked.status, 503); assert.equal((await blocked.json()).code, "core_bridge_not_configured");
});
