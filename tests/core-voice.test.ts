import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { createCoreAuthorization, CORE_ORIGIN, CHAT_SCOPES, NEON_ISSUER, identityScopeId } from "../src/lib/core/authorization.ts";
import { handleVoiceRequest } from "../src/lib/core/voice.ts";
import { handleGatewayLive, liveModel } from "../src/lib/voice/gateway-live.ts";

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

test("Gateway Live checks membership, workspace, request origin and issuance quota before requesting a provider token", async () => {
  let reserved = 0;
  let requested = 0;
  const settings = { ...env, AVATAR_GATEWAY_LIVE_ENABLED: "true", AI_GATEWAY_API_KEY: "fixture-private-key", AVATAR_SETTINGS_DATABASE_URL: "fixture-db" };
  const providerToken = "test-session-token-at-least-16-chars";
  const dependencies = {
    env: settings,
    getIdentity,
    verifyHostedGrant: async () => true,
    verifyQuotaStore: async () => true,
    reserve: async (input: string) => {
      assert.equal(input, scopeId);
      reserved++;
      return true;
    },
    fetch: (async (url, options) => {
      requested++;
      assert.equal(url, "https://ai-gateway.vercel.sh/v1/realtime/client-secrets");
      assert.equal(new Headers(options?.headers).get("authorization"), "Bearer fixture-private-key");
      assert.deepEqual(JSON.parse(String(options?.body)), { model: liveModel, routeKind: "live", expiresIn: 15 });
      return Response.json({ token: providerToken, expiresAt: now + 15, sensitive: "not returned" });
    }) as typeof fetch,
  };
  assert.equal((await handleGatewayLive(req({ scopeId }, "https://other.example.com"), dependencies)).status, 403);
  assert.equal((await handleGatewayLive(req({ scopeId: "a".repeat(64) }), dependencies)).status, 403);
  assert.equal((await handleGatewayLive(req({ scopeId, model: "another" }), dependencies)).status, 400);
  assert.equal((await handleGatewayLive(req({ scopeId }), { ...dependencies, getIdentity: async () => ({ status: "anonymous" }) })).status, 401);
  assert.equal((await handleGatewayLive(req({ scopeId }), { ...dependencies, env: { ...settings, AVATAR_GATEWAY_LIVE_ENABLED: "false" } })).status, 503);
  assert.equal((await handleGatewayLive(req({ scopeId }), { ...dependencies, reserve: async () => false })).status, 429);
  assert.equal((await handleGatewayLive(req({ scopeId }), { ...dependencies, reserve: async () => null })).status, 503);
  assert.equal((await handleGatewayLive(req({ scopeId }), { ...dependencies, verifyHostedGrant: async () => false })).status, 503);
  const nearExpiry = configure({ ...binding, voiceGrant: { ...voiceGrant, expiresAt: iso(now + 10) } });
  assert.equal((await handleGatewayLive(req({ scopeId }), { ...dependencies, env: { ...settings, ...nearExpiry } })).status, 403);
  assert.equal((await handleGatewayLive(req(), { ...dependencies, verifyQuotaStore: async () => false })).status, 503);
  assert.deepEqual(await (await handleGatewayLive(req(), dependencies)).json(), { scopeId, model: liveModel, voice: "gleam" });
  assert.equal(requested, 0);
  assert.equal(reserved, 0);
  const reply = await handleGatewayLive(req({ scopeId }), dependencies);
  assert.equal(reply.status, 200);
  assert.match(reply.headers.get("cache-control") ?? "", /no-store/);
  assert.deepEqual(await reply.json(), { token: providerToken, expiresAt: now + 15, scopeId, model: liveModel, voice: "gleam" });
  assert.equal(requested, 1);
  assert.equal(reserved, 1);
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
  for (const operation of ["voice-readiness", "voice-start", "voice-end"] as const) {
    assert.equal(createCoreAuthorization(identity, configure(binding), now, operation).status, "access_denied");
  }
  const expired = configure({ ...binding, voiceGrant: { ...voiceGrant, expiresAt: iso(now - 1) } });
  assert.equal(createCoreAuthorization(identity, expired, now, "voice-start").status, "access_denied");
  assert.equal(createCoreAuthorization(identity, expired, now, "voice-end").status, "ready");
  assert.equal(createCoreAuthorization(identity, configure({ ...binding, voiceGrant: { ...voiceGrant, scope: "*" } }), now, "voice-start").status, "not_connected");
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
