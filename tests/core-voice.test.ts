import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { createCoreAuthorization, CORE_ORIGIN, CHAT_SCOPES, NEON_ISSUER, identityScopeId } from "../src/lib/core/authorization.ts";
import { handleVoiceRequest } from "../src/lib/core/voice.ts";
import { handleCoreLiveRelay } from "../src/lib/voice/core-live-relay.ts";

const now = Math.floor(Date.now() / 1000);
const iso = (timestamp: number) => new Date(timestamp * 1000).toISOString();
const origin = "https://avatar.example.com";
const identity = {
  issuer: NEON_ISSUER, userId: "11111111-1111-4111-8111-111111111111", sessionId: "fixture",
  sessionExpiresAt: iso(now + 2000), organizationId: "22222222-2222-4222-8222-222222222222",
  memberId: "33333333-3333-4333-8333-333333333333", role: "owner",
};
const binding = {
  issuer: NEON_ISSUER, neonUserId: identity.userId, neonOrganizationId: identity.organizationId,
  neonMemberId: identity.memberId, neonRole: "owner", coreUserId: "44444444-4444-4444-8444-444444444444",
  coreTenantId: "55555555-5555-4555-8555-555555555555", approvalRef: "fixture:chat", expiresAt: iso(now + 1000),
};
const voiceGrant = { approvalRef: "fixture:voice", expiresAt: iso(now + 300) };
const pem = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const configure = (mapping: object) => ({
  CORE_CHAT_ENABLED: "true", CORE_AUTH_ISSUER: origin, AVATAR_APP_ORIGIN: origin, CORE_API_BASE_URL: CORE_ORIGIN,
  CORE_AUTH_AUDIENCE: "test:core", CORE_AUTH_CLIENT_ID: "fixture", CORE_AUTH_KEY_ID: "test", CORE_AUTH_PRIVATE_KEY: pem,
  CORE_IDENTITY_BINDINGS_JSON: JSON.stringify({ version: 1, bindings: [mapping] }),
});
const env = configure({ ...binding, voiceGrant });
const scopeId = identityScopeId(identity);
const requestKey = "voice_attempt_123";
const sdp = "v=0\r\no=fixture\r\n";
const missionId = "66666666-6666-4666-8666-666666666666";
const receiptId = "77777777-7777-4777-8777-777777777777";
const start = { scopeId, requestKey, sdp };
const metadata = { model: "gpt-live-1", voice: "marin", verification: "model_metadata_only", voiceModelAccessVerified: true,
  serverControlsConnected: true, nativeReasoningConfigured: true, reasoningModelAccessVerified: true,
  reasoningModel: "gpt-reasoning-fixture", voiceHistoryPersistence: true };
const getIdentity = async () => ({ status: "authenticated" as const, identity });
const neverFetch: typeof fetch = async () => { throw Error("unexpected upstream request"); };

test("the relay admits only a fresh owner, a scoped Core ticket, and the same mission for lease renewal", async () => {
  const paths: string[] = [];
  const settings = { ...env, AVATAR_CORE_LIVE_RELAY_ENABLED: "true" };
  const ticketRequest = { scopeId, requestKey: receiptId };
  const renewal = { scopeId, missionId };
  const ticket = "a".repeat(43);
  const model = "gpt-live-1";
  const socketUrl = CORE_ORIGIN.replace("https:", "wss:") + "/v1/media/relay/socket";
  const expiresAt = now + 12;
  const leaseExpiresAt = iso(now + 10);
  const deadlineAt = iso(now + 300);
  let grantId = "";
  const dependencies = {
    env: settings,
    getIdentity,
    fetch: (async (url, options) => {
      const path = new URL(String(url)).pathname;
      paths.push(path);
      assert.equal(new URL(String(url)).origin, CORE_ORIGIN);
      const grant = claims(new Headers(options?.headers).get("authorization")!.slice(7));
      assert.equal(grant.scope, "voice:relay");
      assert.match(grant.voice_grant_id, /^[a-f0-9]{64}$/);
      grantId ||= grant.voice_grant_id;
      assert.equal(grant.voice_grant_id, grantId);
      assert.equal(grant.voice_grant_expires_at, now + 300);
      assert.equal(grant.exp - grant.iat, 20);
      if (path.endsWith("/readiness")) {
        assert.equal(options?.method, "GET");
        return Response.json({ ready: true, model, voice: "gleam", extra: "private" });
      }
      if (path.endsWith("/tickets")) {
        assert.deepEqual(JSON.parse(String(options?.body)), { requestKey: receiptId });
        assert.ok(!("voice_relay_mission_id" in grant));
        return Response.json({ ticket, missionId, expiresAt, socketUrl, voice: "gleam", model, leaseRenewAfterMs: 3000, extra: "private" }, { status: 201 });
      }
      assert.equal(path, "/v1/media/relay/" + missionId + "/lease");
      assert.equal(grant.voice_relay_mission_id, missionId);
      assert.deepEqual(JSON.parse(String(options?.body)), {});
      return Response.json({ missionId, leaseExpiresAt, deadlineAt, extra: "private" });
    }) as typeof fetch,
  };
  assert.equal((await handleCoreLiveRelay(req(ticketRequest, "https://other.example.com"), dependencies)).status, 403);
  assert.equal((await handleCoreLiveRelay(req({ ...ticketRequest, scopeId: "a".repeat(64) }), dependencies)).status, 403);
  assert.equal((await handleCoreLiveRelay(req({ scopeId, missionId: "../profile" }), dependencies)).status, 400);
  assert.equal((await handleCoreLiveRelay(req({ ...ticketRequest, model: "another" }), dependencies)).status, 400);
  assert.equal((await handleCoreLiveRelay(req(renewal), { ...dependencies, getIdentity: async () => ({ status: "anonymous" }) })).status, 401);
  assert.equal((await handleCoreLiveRelay(req(renewal), { ...dependencies, getIdentity: async () => ({ status: "access_denied" }) })).status, 403);
  assert.equal((await handleCoreLiveRelay(req(ticketRequest), { ...dependencies, env })).status, 503);
  const nearExpiry = configure({ ...binding, voiceGrant: { ...voiceGrant, expiresAt: iso(now + 4) } });
  assert.equal((await handleCoreLiveRelay(req(renewal), { ...dependencies, env: { ...settings, ...nearExpiry } })).status, 403);
  assert.equal(paths.length, 0);
  assert.deepEqual(await (await handleCoreLiveRelay(req(), dependencies)).json(), { scopeId, model, voice: "gleam" });
  const reply = await handleCoreLiveRelay(req(ticketRequest), dependencies);
  assert.equal(reply.status, 201);
  assert.match(reply.headers.get("cache-control") ?? "", /no-store/);
  assert.deepEqual(await reply.json(), { ticket, missionId, expiresAt, scopeId, model, voice: "gleam", socketUrl, leaseRenewAfterMs: 3000 });
  assert.deepEqual(await (await handleCoreLiveRelay(req(renewal), dependencies)).json(), {
    scopeId, missionId, leaseExpiresAt: Date.parse(leaseExpiresAt), deadlineAt: Date.parse(deadlineAt),
  });
  assert.equal(paths.length, 3);
  const mismatch = { ...dependencies, fetch: async () => Response.json({ ticket, missionId, expiresAt, socketUrl: "wss://elsewhere.example/socket", voice: "gleam", model, leaseRenewAfterMs: 3000 }, { status: 201 }) };
  assert.equal((await handleCoreLiveRelay(req(ticketRequest), mismatch)).status, 502);
  assert.equal((await handleCoreLiveRelay(req(renewal), { ...dependencies, fetch: async () => new Response(null, { status: 403 }) })).status, 403);
});
function req(body?: object, originHeader = origin) {
  return new Request(origin, body ? { method: "POST", headers: { origin: originHeader, "content-type": "application/json" }, body: JSON.stringify(body) } : {});
}
function claims(token: string) { return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()); }

test("chat cannot inherit media scopes; media requires independent finite authorization on this membership", () => {
  const voiceOnlyGrant = configure({ ...binding, voiceGrant: { ...voiceGrant, expiresAt: iso(now + 19) } });
  for (const operation of ["chat", "voice-readiness", "voice-start", "voice-end"] as const) {
    const auth = createCoreAuthorization(identity, voiceOnlyGrant, now, operation);
    assert.equal(auth.status, "ready");
    if (auth.status !== "ready") return;
    const payload = claims(auth.token);
    assert.equal(payload.scope, operation === "voice-start" || operation === "voice-end" ? CHAT_SCOPES + " task:submit" : CHAT_SCOPES);
    if (operation === "voice-readiness" || operation === "voice-start") assert.equal(payload.exp, now + 19);
    assert.equal(createCoreAuthorization({ ...identity, role: "member" }, env, now, operation).status, "access_denied");
  }
  for (const operation of ["voice-readiness", "voice-start", "voice-end", "voice-relay"] as const) {
    assert.equal(createCoreAuthorization(identity, configure(binding), now, operation).status, "access_denied");
  }
  const expired = configure({ ...binding, voiceGrant: { ...voiceGrant, expiresAt: iso(now - 1) } });
  assert.equal(createCoreAuthorization(identity, expired, now, "voice-start").status, "access_denied");
  assert.equal(createCoreAuthorization(identity, expired, now, "voice-end").status, "ready");
  assert.equal(createCoreAuthorization(identity, expired, now, "voice-relay").status, "access_denied");
  assert.equal(createCoreAuthorization(identity, configure({ ...binding, voiceGrant: { ...voiceGrant, scope: "*" } }), now, "voice-start").status, "not_connected");
});

test("relay delegations bind the active Neon session and cap provider authority at the earliest expiry", () => {
  const shortSession = { ...identity, sessionExpiresAt: iso(now + 18) };
  const auth = createCoreAuthorization(shortSession, env, now, "voice-relay", missionId);
  const otherLogin = createCoreAuthorization({ ...shortSession, sessionId: "new-fixture-session" }, env, now, "voice-relay", missionId);
  assert.ok(auth.status === "ready" && otherLogin.status === "ready");
  assert.equal(claims(auth.token).voice_grant_expires_at, now + 18);
  assert.equal(claims(auth.token).voice_relay_mission_id, missionId);
  assert.equal(claims(auth.token).exp, now + 18);
  assert.notEqual(claims(auth.token).voice_grant_id, claims(otherLogin.token).voice_grant_id);
});

test("cross-origin, stale workspace, unsupported fields, invalid SDP, size and method are rejected before provider dispatch", async () => {
  let calls = 0;
  const deps = { env, getIdentity, fetch: (async () => { calls++; throw Error(); }) as typeof fetch };
  for (const [request, operation, status] of [
    [req(start, "https://other.example.com"), "voice/start", 403],
    [req({ ...start, scopeId: "a".repeat(64) }), "voice/start", 403],
    [req({ ...start, scopes: ["task:submit"] }), "voice/start", 400],
    [req({ ...start, sdp: "invalid-sdp" }), "voice/start", 400],
    [req({ ...start, sdp: "x".repeat(18000) }), "voice/start", 413],
    [req({ scopeId, missionId: "../profile" }), "voice/end", 400],
    [req(), "voice/start", 405],
    [req(), "video/start", 404],
  ] as const) {
    assert.equal((await handleVoiceRequest(request, operation, deps)).status, status);
  }
  assert.equal((await handleVoiceRequest(req(), "readiness", { ...deps, getIdentity: async () => ({ status: "anonymous" }) })).status, 401);
  assert.equal(calls, 0);
});

test("readiness reads model metadata only; negotiation projects the SDP, receipts, and no other Core data", async () => {
  const readiness = await handleVoiceRequest(req(), "readiness", { env, getIdentity, fetch: async (url, options) => {
    assert.equal(url, CORE_ORIGIN + "/v1/media/readiness"); assert.equal(options?.method, "GET");
    assert.equal(options?.cache, "no-store"); assert.equal(options?.redirect, "error");
    return Response.json({ ...metadata, secret: "must-not-leak" });
  } });
  assert.equal(readiness.status, 200);
  assert.match(readiness.headers.get("cache-control")!, /no-store/);
  assert.deepEqual(await readiness.json(), { scopeId, model: metadata.model, voice: metadata.voice, voiceModelAccessVerified: true, serverControlsConnected: true,
    nativeReasoningConfigured: true, reasoningModelAccessVerified: true, nativeReasoningReady: true,
    canStartVoice: true, voiceHistoryPersistence: true, audioVerified: false });
  const response = await handleVoiceRequest(req(start), "voice/start", { env, getIdentity, fetch: async (url, options) => {
    if (url === CORE_ORIGIN + "/v1/media/readiness") {
      assert.equal(claims(new Headers(options?.headers).get("authorization")!.slice(7)).scope, CHAT_SCOPES);
      assert.equal(options?.method, "GET");
      return Response.json(metadata);
    }
    assert.equal(url, CORE_ORIGIN + "/v1/media/webrtc");
    assert.deepEqual(JSON.parse(String(options?.body)), { requestKey, sdp });
    assert.equal(claims(new Headers(options?.headers).get("authorization")!.slice(7)).scope, CHAT_SCOPES + " task:submit");
    return Response.json({ missionId, receiptId, status: "created", duplicate: false, transport: { type: "webrtc", sdp }, secret: "must-not-leak" });
  } });
  assert.deepEqual(await response.json(), { scopeId, missionId, receiptId, status: "created", sdp });
});

test("existing Core reservation can be closed, unknown dispatch stays uncertain, and the adapter never retries", async () => {
  const replay = await handleVoiceRequest(req(start), "voice/start", { env, getIdentity, fetch: async (url) => url === CORE_ORIGIN + "/v1/media/readiness" ? Response.json(metadata) :
    Response.json({ missionId, status: "running", duplicate: true, transport: null }) });
  assert.equal(replay.status, 409);
  assert.deepEqual(await replay.json(), { scopeId, error: "already_requested", missionId });
  let calls = 0;
  const failed = await handleVoiceRequest(req(start), "voice/start", { env, getIdentity, fetch: async (url) => { if (url === CORE_ORIGIN + "/v1/media/readiness") return Response.json(metadata); calls++; throw Error("private error"); } });
  assert.deepEqual(await failed.json(), { scopeId, error: "outcome_unknown" });
  assert.equal(calls, 1);
  const closed = await handleVoiceRequest(req({ scopeId, missionId }), "voice/end", { env, getIdentity, fetch: async (url, opts) => {
    assert.equal(url, CORE_ORIGIN + "/v1/media/sessions/" + missionId + "/close");
    assert.deepEqual(JSON.parse(String(opts?.body)), {});
    return Response.json({ missionId, status: "closing", arbitrary: "secret" });
  } });
  assert.deepEqual(await closed.json(), { scopeId, missionId, status: "closing" });
  const noGrant = await handleVoiceRequest(req(start), "voice/start", { env: configure(binding), getIdentity, fetch: neverFetch });
  assert.deepEqual(await noGrant.json(), { scopeId, error: "voice_not_granted" });
});

test("direct POST cannot bypass a failed model or supervision preflight or spoof readiness claims", async () => {
  for (const probe of [
    () => Response.json({ ...metadata, serverControlsConnected: false }),
    () => Response.json({ ...metadata, voiceModelAccessVerified: false }),
    () => Response.json({ ...metadata, voiceModelAccessVerified: "true" }),
    () => Response.json({ nested: metadata }),
    () => Response.json({ model: "gpt-live-1" }),
    () => new Response("offline", { status: 503 }),
    () => { throw Error("timeout"); },
  ]) {
    const upstream: string[] = [];
    const result = await handleVoiceRequest(req(start), "voice/start", { env, getIdentity, fetch: async (url, options) => {
      upstream.push(String(url));
      assert.equal(options?.method, "GET");
      return probe();
    } });
    assert.equal(result.status, 503);
    assert.deepEqual(await result.json(), { error: "voice_not_ready", scopeId });
    assert.deepEqual(upstream, [CORE_ORIGIN + "/v1/media/readiness"]);
  }
  const spoof = await handleVoiceRequest(req({ ...start, canStartVoice: true }), "voice/start", { env, getIdentity, fetch: neverFetch });
  assert.equal(spoof.status, 400);
});

test("voice conversation remains available without native reasoning, but approval or membership changes during preflight stop dispatch", async () => {
  const conversational = { ...metadata, reasoningModel: null, nativeReasoningConfigured: false, reasoningModelAccessVerified: false };
  const upstream: string[] = [];
  const fetcher: typeof fetch = async url => {
    upstream.push(String(url));
    if (url === CORE_ORIGIN + "/v1/media/readiness") return Response.json(conversational);
    return Response.json({ missionId, receiptId, status: "created", duplicate: false, transport: { type: "webrtc", sdp } });
  };
  const status = await handleVoiceRequest(req(), "readiness", { env, getIdentity, fetch: fetcher });
  const modes = await status.json();
  assert.equal(modes.canStartVoice, true);
  assert.equal(modes.nativeReasoningReady, false);
  assert.equal((await handleVoiceRequest(req(start), "voice/start", { env, getIdentity, fetch: fetcher })).status, 201);
  assert.deepEqual(upstream.splice(0), [CORE_ORIGIN + "/v1/media/readiness", CORE_ORIGIN + "/v1/media/readiness", CORE_ORIGIN + "/v1/media/webrtc"]);
  let resolutions = 0;
  const lostMembership = await handleVoiceRequest(req(start), "voice/start", { env,
    getIdentity: async () => ++resolutions === 1 ? getIdentity() : { status: "access_denied" }, fetch: fetcher });
  assert.equal(lostMembership.status, 403);
  assert.deepEqual(upstream.splice(0), [CORE_ORIGIN + "/v1/media/readiness"]);
  const grantEnv = configure({ ...binding, voiceGrant });
  const lostGrant = await handleVoiceRequest(req(start), "voice/start", { env: grantEnv, getIdentity, fetch: async (url, options) => {
    grantEnv.CORE_IDENTITY_BINDINGS_JSON = configure(binding).CORE_IDENTITY_BINDINGS_JSON;
    return fetcher(url, options);
  } });
  assert.equal(lostGrant.status, 403);
  assert.deepEqual(upstream, [CORE_ORIGIN + "/v1/media/readiness"]);
});
