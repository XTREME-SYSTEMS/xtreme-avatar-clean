import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { identityScopeId } from "../src/lib/core/authorization.ts";
import type { VerifiedIdentity } from "../src/lib/auth/types.ts";
import { handleTavusRender } from "../src/lib/tavus/render-handler.ts";
import type { RenderStore } from "../src/lib/tavus/render-handler.ts";
import { edenFaceId, echoPalId } from "../src/lib/tavus/render-provider.ts";
import { TavusRenderClient } from "../src/lib/tavus/render-client.ts";

const origin = "https://avatar.example.test";
const identity: VerifiedIdentity = {
  issuer: origin, userId: "owner", organizationId: "workspace", memberId: "member",
  sessionId: "session", role: "owner", emailVerified: true,
  sessionExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
};
const scopeId = identityScopeId(identity);
const requestId = randomUUID();
const input = { scopeId, requestId };
const room = { conversationId: "c123456", conversationUrl: "https://tavus.daily.co/c123456", meetingToken: "fake.private.token" };

function request(method = "POST", payload: object = input, source = origin, signal?: AbortSignal) {
  return new Request(origin + "/api/eden/tavus-render", {
    method, headers: { origin: source, "content-type": "application/json" }, signal,
    ...(method !== "GET" && { body: JSON.stringify(payload) }),
  });
}

function fixture() {
  const env: Record<string, string | undefined> = {
    AVATAR_APP_ORIGIN: origin,
    AVATAR_TAVUS_RENDER_ENABLED: "true",
    AVATAR_TAVUS_RENDER_SCOPE_ID: scopeId,
    AVATAR_TAVUS_RENDER_GRANT_EXPIRES_AT: identity.sessionExpiresAt,
    TAVUS_API_KEY: "server-key",
  };
  const calls: string[] = [];
  const audit: string[] = [];
  const state = { disclosure: "off", remaining: true, validRoom: true, lostResponse: false, saved: false, ended: false, cancelled: false };
  const store: RenderStore = {
    async check() {},
    async reserve() { const reserved = state.remaining; state.remaining = false; return reserved; },
    async saveRoom(scope, id, conversationId) {
      assert.deepEqual([scope, id, conversationId], [scopeId, requestId, room.conversationId]);
      state.saved = true;
      return { cancelled: state.cancelled };
    },
    async requestClose(scope, id) {
      if (state.remaining || scope !== scopeId || id !== requestId) return null;
      state.cancelled = true;
      return { conversationId: state.saved ? room.conversationId : null, ended: state.ended };
    },
    async markEnded() { state.ended = true; },
  };
  const deps: Parameters<typeof handleTavusRender>[1] = {
    env, getIdentity: async () => ({ status: "authenticated", identity }), getStore: () => store,
    audit(event, id) { assert.equal(id, requestId); audit.push(event); },
    async fetch(url, init) {
      const path = new URL(String(url)).pathname;
      assert.equal(new URL(String(url)).origin, "https://tavusapi.com");
      assert.equal(new Headers(init?.headers).get("x-api-key"), env.TAVUS_API_KEY);
      assert.equal(init?.redirect, "error");
      calls.push(path);
      if (path === "/v2/faces/" + edenFaceId) return Response.json({ face_id: edenFaceId, status: "completed" });
      if (path === "/v2/pals/" + echoPalId) return Response.json({
        pal_id: echoPalId, default_face_id: edenFaceId, pipeline_mode: "echo", greeting: "",
        dynamic_greeting: false, disclosure_type: state.disclosure, callback_url: null, tool_ids: [],
        document_ids: [], document_tags: [], skills: {},
        layers: {
          conversational_flow: { idle_engagement: "off" },
          transport: { transport_type: "daily", input_settings: { microphone: "disabled" },
            room_settings: { enable_recording: "", enable_transcription: false } },
        },
      });
      if (path === "/v2/conversations/" + room.conversationId + "/end") {
        assert.equal(init?.method, "POST");
        return new Response(null, { status: 204 });
      }
      assert.equal(path, "/v2/conversations");
      assert.equal(init?.method, "POST");
      assert.deepEqual(JSON.parse(String(init?.body)), {
        pal_id: echoPalId, face_id: edenFaceId, conversation_name: "Xtreme Avatar render " + requestId,
        require_auth: true, max_participants: 2, dynamic_greeting: false, participant_tags: [],
        properties: { max_call_duration: 120, participant_absent_timeout: 30, participant_left_timeout: 15,
          enable_recording: false, auto_start_recording: false, enable_closed_captions: false },
      });
      if (state.lostResponse) throw new Error("upstream timeout");
      return Response.json({
        conversation_id: room.conversationId, conversation_url: state.validRoom ? room.conversationUrl : "https://elsewhere.example/c123456",
        meeting_token: room.meetingToken, status: "active",
      });
    },
  };
  return { deps, env, calls, audit, state };
}

test("denies unverified, cross-workspace, foreign-origin, disabled and unconfigured requests before provider access", async () => {
  const { deps, env, calls } = fixture();
  assert.equal((await handleTavusRender(request("POST", input, "https://other.example"), deps)).status, 403);
  assert.equal((await handleTavusRender(request("POST", { ...input, face: edenFaceId }), deps)).status, 400);
  assert.equal((await handleTavusRender(request("POST", { ...input, scopeId: "a".repeat(64) }), deps)).status, 403);
  assert.equal((await handleTavusRender(request(), { ...deps, getIdentity: async () => ({ status: "anonymous" }) })).status, 401);
  assert.equal((await handleTavusRender(request(), { ...deps, getIdentity: async () => ({ status: "authenticated", identity: { ...identity, role: "member" } }) })).status, 403);
  env.AVATAR_TAVUS_RENDER_ENABLED = "false";
  assert.equal((await handleTavusRender(request(), deps)).status, 503);
  env.AVATAR_TAVUS_RENDER_ENABLED = "true";
  env.TAVUS_API_KEY = undefined;
  assert.deepEqual(await (await handleTavusRender(request(), deps)).json(), { error: "tavus_key_required" });
  assert.deepEqual(calls, []);
});

test("readiness is metadata only and spoken disclosure blocks room creation", async () => {
  const { deps, calls, state, audit } = fixture();
  assert.deepEqual(await (await handleTavusRender(request("GET"), deps)).json(), {
    scopeId, transport: "daily-audio-echo", playbackVerified: false,
  });
  state.disclosure = "auto";
  const denied = await handleTavusRender(request(), deps);
  assert.equal(denied.status, 503);
  assert.deepEqual(await denied.json(), { error: "tavus_spoken_output_enabled" });
  assert.equal(state.remaining, true);
  assert.equal(calls.includes("/v2/conversations"), false);
  assert.deepEqual(audit, []);
});

test("starts a bounded private room once and closes only the stored room under the same scope", async () => {
  const { deps, env, calls, audit } = fixture();
  const started = await handleTavusRender(request(), deps);
  assert.equal(started.status, 201);
  assert.match(started.headers.get("cache-control") ?? "", /private, no-store/);
  assert.deepEqual(await started.json(), { ...input, ...room, maxDurationSeconds: 120, playbackVerified: false });
  assert.equal((await handleTavusRender(request(), deps)).status, 429);
  assert.equal((await handleTavusRender(request("DELETE", { ...input, requestId: randomUUID() }), deps)).status, 404);
  env.AVATAR_TAVUS_RENDER_ENABLED = "false";
  assert.deepEqual(await (await handleTavusRender(request("DELETE"), deps)).json(), { status: "ended" });
  assert.equal((await handleTavusRender(request("DELETE"), deps)).status, 200);
  assert.equal(calls.filter(path => path === "/v2/conversations").length, 1);
  assert.equal(calls.filter(path => path.endsWith("/end")).length, 1);
  assert.deepEqual(audit, ["reserved", "created", "ended"]);
});

test("ends a known malformed room and never retries uncertain provider creation", async () => {
  const malformed = fixture();
  malformed.state.validRoom = false;
  assert.equal((await handleTavusRender(request(), malformed.deps)).status, 502);
  assert.equal(malformed.calls.filter(path => path.endsWith("/end")).length, 1);
  assert.equal(malformed.state.ended, true);
  assert.deepEqual(malformed.audit, ["reserved", "start_failed_room_ended"]);
  const lost = fixture();
  lost.state.lostResponse = true;
  assert.equal((await handleTavusRender(request(), lost.deps)).status, 502);
  assert.equal((await handleTavusRender(request(), lost.deps)).status, 429);
  assert.equal(lost.calls.filter(path => path === "/v2/conversations").length, 1);
  assert.deepEqual(lost.audit, ["reserved", "start_unconfirmed"]);
});

test("cancellation during creation ends the known room and keeps the cleanup receipt", async () => {
  const { deps, state, audit } = fixture();
  const controller = new AbortController();
  const upstream = deps.fetch!;
  deps.fetch = async (url, init) => {
    const response = await upstream(url, init);
    if (new URL(String(url)).pathname === "/v2/conversations") controller.abort();
    return response;
  };
  const result = await handleTavusRender(request("POST", input, origin, controller.signal), deps);
  assert.deepEqual(await result.json(), { error: "tavus_render_start_failed" });
  assert.equal(state.ended, true);
  assert.deepEqual(audit, ["reserved", "start_failed_room_ended"]);
});

test("a close request before the provider returns prevents room credentials from being returned", async () => {
  const { deps, state } = fixture();
  const upstream = deps.fetch!;
  deps.fetch = async (url, init) => {
    if (new URL(String(url)).pathname === "/v2/conversations") {
      const closing = await handleTavusRender(request("DELETE"), deps);
      assert.equal(closing.status, 202);
      assert.deepEqual(await closing.json(), { status: "closing" });
    }
    return upstream(url, init);
  };
  const start = await handleTavusRender(request(), deps);
  assert.equal(start.status, 502);
  assert.deepEqual(await start.json(), { error: "tavus_render_start_failed" });
  assert.equal(state.ended, true);
});

test("an uncertain end is reconciled only by reading the stored room's ended state", async () => {
  const { deps } = fixture();
  const upstream = deps.fetch!;
  let remoteStatus = "active";
  deps.fetch = async (url, init) => {
    const path = new URL(String(url)).pathname;
    if (path.endsWith("/end")) return new Response(null, { status: 502 });
    if (path === "/v2/conversations/" + room.conversationId) {
      assert.equal(init?.method, "GET");
      return Response.json({ conversation_id: room.conversationId, status: remoteStatus });
    }
    return upstream(url, init);
  };
  assert.equal((await handleTavusRender(request(), deps)).status, 201);
  assert.equal((await handleTavusRender(request("DELETE"), deps)).status, 502);
  remoteStatus = "ended";
  assert.deepEqual(await (await handleTavusRender(request("DELETE"), deps)).json(), { status: "ended" });
});

test("browser adapter joins without capture and emits only bounded PCM Echo data", async (t) => {
  const messages: { event_type: string; properties?: { modality: string; inference_id: string; done: boolean } }[] = [];
  const methods: string[] = [];
  t.mock.method(globalThis, "fetch", async (_: string, options: RequestInit) => {
    methods.push(String(options.method));
    if (options.method === "DELETE") return Response.json({ status: "ended" });
    return Response.json({ ...room, ...JSON.parse(String(options.body)), maxDurationSeconds: 120 });
  });
  const original = Object.getOwnPropertyDescriptor(globalThis, "MediaStream");
  Object.defineProperty(globalThis, "MediaStream", { configurable: true, value: class {
    readonly tracks: MediaStreamTrack[];
    constructor(tracks: MediaStreamTrack[]) { this.tracks = tracks; }
  } });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, "MediaStream", original);
    else Reflect.deleteProperty(globalThis, "MediaStream");
  });
  const video = {} as HTMLVideoElement;
  let destroys = 0;
  const client = new TavusRenderClient(scopeId, videoCall(), video);
  t.after(() => client.close());

  function videoCall() {
    return {
      async join(options: object) {
        assert.deepEqual(options, { url: room.conversationUrl, token: room.meetingToken,
          startAudioOff: true, startVideoOff: true, audioSource: false, videoSource: false });
      },
      sendAppMessage(message: object, participant: string) {
        assert.equal(participant, "*");
        assert.ok(Buffer.byteLength(JSON.stringify(message)) < 4096);
        assert.ok(!Object.hasOwn((message as { properties?: object }).properties ?? {}, "text"));
        messages.push(message as typeof messages[number]);
      },
      async destroy() { destroys++; },
    };
  }

  await client.start();
  assert.equal(client.ready, false);
  assert.equal(video.muted, true);
  client.attachAvatarVideo("pal-participant", { kind: "video", readyState: "live" } as MediaStreamTrack);
  assert.equal(client.ready, true);
  assert.throws(() => client.sendGleamAudio("YQ=="), /PCM16/);
  client.sendGleamAudio(Buffer.alloc(4000).toString("base64"));
  client.finishUtterance();
  client.interrupt();
  assert.equal(messages.length, 5);
  assert.ok(messages.slice(0, 4).every(message => message.event_type === "conversation.echo" &&
    message.properties?.modality === "audio" && message.properties.inference_id === messages[0].properties?.inference_id));
  assert.deepEqual(messages.map(message => message.properties?.done), [false, false, false, true, undefined]);
  assert.equal(messages[4].event_type, "conversation.interrupt");
  await client.close();
  assert.deepEqual(methods, ["POST", "DELETE"]);
  assert.equal(destroys, 1);
  assert.equal(video.srcObject, null);
});
