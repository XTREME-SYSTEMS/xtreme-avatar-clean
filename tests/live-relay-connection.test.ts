import assert from "node:assert/strict";
import test from "node:test";
import { LiveVoiceConnection } from "../src/lib/voice/live-connection.ts";

test("the browser joins the Core relay, renews the exact mission, and stops its microphone when renewal is denied", async (t) => {
  const scopeId = "a".repeat(64);
  const missionId = "66666666-6666-4666-8666-666666666666";
  const ticket = "b".repeat(43);
  const socketUrl = "wss://core-api-staging-dec8a723.up.railway.app/v1/media/relay/socket";
  let micStopped = false;
  const updates: unknown[] = [];
  const requests: unknown[] = [];

  class FakeSocket {
    static OPEN = 1;
    static readonly instances: FakeSocket[] = [];
    readyState = FakeSocket.OPEN;
    sent: unknown[] = [];
    onopen?: () => void;
    onmessage?: ({ data }: { data: string }) => void;
    constructor(url: string, protocols: string[]) {
      assert.equal(url, socketUrl);
      assert.deepEqual(protocols, ["eden-live-relay.v1", "eden-live-ticket." + ticket]);
      FakeSocket.instances.push(this);
    }
    send(data: string) { this.sent.push(JSON.parse(data)); }
    emit(event: object) { this.onmessage?.({ data: JSON.stringify(event) }); }
    close() { this.readyState = 3; }
  }
  class FakeWorklet {
    port = { close() {} };
    connect(node: object) { return node; }
  }
  class FakeAudioContext {
    state = "running";
    sampleRate = 24_000;
    audioWorklet = { async addModule() {} };
    destination = {};
    async resume() {}
    async close() { this.state = "closed"; }
    createMediaStreamSource() { return { connect(node: FakeWorklet) { return node; } }; }
    createGain() { return { gain: { value: 1 }, connect() {} }; }
  }
  const replacements = {
    WebSocket: FakeSocket, AudioContext: FakeAudioContext, AudioWorkletNode: FakeWorklet,
    navigator: { mediaDevices: { async getUserMedia() { return { getTracks: () => [{ stop() { micStopped = true; } }] }; } } },
  };
  for (const [name, value] of Object.entries(replacements)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { value, configurable: true });
    t.after(() => {
      if (original) Object.defineProperty(globalThis, name, original);
      else Reflect.deleteProperty(globalThis, name);
    });
  }
  t.mock.timers.enable({ apis: ["setTimeout"] });
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.equal(url, "/api/eden/gateway-live");
    assert.equal(init.credentials, "same-origin");
    const input = JSON.parse(String(init.body));
    requests.push(input);
    if (input.missionId) {
      if (requests.length > 2) return new Response(null, { status: 403 });
      return Response.json({ scopeId, missionId, leaseExpiresAt: Date.now() + 10000 });
    }
    return Response.json({
      scopeId, missionId, ticket, socketUrl, model: "gpt-live-1", voice: "gleam",
      expiresAt: Math.floor(Date.now() / 1000) + 10, leaseRenewAfterMs: 3000,
    }, { status: 201 });
  });

  const live = new LiveVoiceConnection({ update: (event) => updates.push(event), delegate: () => "", transcript: () => {} });
  await live.start(scopeId);
  const socket = FakeSocket.instances[0];
  assert.ok(socket);
  assert.deepEqual(socket.sent, []);
  assert.deepEqual(Object.keys(requests[0] as object).sort(), ["requestKey", "scopeId"]);
  socket.onopen?.();
  t.mock.timers.tick(3000);
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.deepEqual(requests[1], { scopeId, missionId });
  assert.deepEqual(updates, []);
  assert.deepEqual(socket.sent, []);
  socket.emit({ type: "session.started", missionId, session: { model: "gpt-live-1", audio: { output: { voice: "gleam" } } } });
  assert.deepEqual(updates, [{ state: "connected" }]);
  t.mock.timers.tick(3000);
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.deepEqual(requests[2], { scopeId, missionId });
  assert.equal(micStopped, true);
  assert.deepEqual(socket.sent, [{ type: "session.close" }]);
  assert.deepEqual(updates.at(-1), { state: "closing" });
  socket.emit({ type: "session.closed", usage: { seconds: 4 } });
  assert.deepEqual(updates.at(-1), { state: "closed", confirmed: true, seconds: 4 });
  assert.equal(socket.readyState, 3);
});
