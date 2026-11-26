import assert from "node:assert/strict";
import test from "node:test";
import { VoiceConnection, readVoiceReadiness } from "../src/components/mobile-media/voice-connection.ts";
import type { VoiceUpdate } from "../src/components/mobile-media/voice-connection.ts";

const scopeId = "c".repeat(64);
const missionId = "4a7c54db-e519-4d89-be58-8ab8993e8431";
const offer = "v=0\r\ns=fixture\r\n";
const answer = "v=0\r\ns=answer\r\n";
const ok = (data: unknown) => Response.json(data);

test("voice admission requires a verified model, controls and a workspace fence", () => {
  const result = { scopeId, voice: "gleam", voiceModelAccessVerified: true, serverControlsConnected: true, canStartVoice: true, nativeReasoningReady: false };
  assert.deepEqual(readVoiceReadiness(result), { ready: true, reasoningReady: false, voice: "gleam", scopeId });
  assert.equal(readVoiceReadiness({ ...result, canStartVoice: false })?.ready, false);
  assert.equal(readVoiceReadiness({ ...result, nativeReasoningReady: true })?.reasoningReady, true);
  assert.equal(readVoiceReadiness({ ...result, scopeId: "foreign" }), null);
  assert.equal(readVoiceReadiness({ ...result, serverControlsConnected: false })?.ready, false);
  assert.equal(readVoiceReadiness({ ...result, voiceModelAccessVerified: false })?.ready, false);
});

class Channel extends EventTarget {
  readyState = "open";
  onmessage?: (event: MessageEvent) => void;
  sent: string[] = [];
  send(data: string) { this.sent.push(data); }
  receive(type: string) {
    const event = new MessageEvent("message", { data: JSON.stringify({ type }) });
    this.onmessage?.(event); this.dispatchEvent(event);
  }
}
class Peer extends EventTarget {
  static last?: Peer;
  channel = new Channel();
  iceGatheringState = "complete";
  localDescription?: RTCSessionDescriptionInit;
  closed = false;
  constructor() { super(); Peer.last = this; }
  async createOffer() { return { type: "offer", sdp: offer }; }
  async setLocalDescription(desc: RTCSessionDescriptionInit) { this.localDescription = desc; }
  async setRemoteDescription(desc: RTCSessionDescriptionInit) { assert.equal(desc.sdp, answer); }
  addTrack() {}
  createDataChannel() { return this.channel; }
  close() { this.closed = true; }
}

function fixture(t: import("node:test").TestContext, dispatch: (url: string, body: Record<string, string>) => Promise<Response>) {
  const track = { stopped: false, enabled: true, stop() { this.stopped = true; } };
  const prior = new Map<string, PropertyDescriptor | undefined>();
  function replace(key: string, value: unknown) {
    prior.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
  replace("navigator", { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [track], getAudioTracks: () => [track] }) } });
  replace("RTCPeerConnection", Peer);
  replace("MediaStream", class {});
  replace("fetch", async (url: string, init: RequestInit) => dispatch(url, JSON.parse(String(init.body))));
  t.after(() => { for (const [key, descriptor] of prior) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); } });
  const states: VoiceUpdate[] = [];
  const audio = { srcObject: null, pause() {}, play() { return Promise.resolve(); } } as unknown as HTMLAudioElement;
  const call = new VoiceConnection(scopeId, audio, state => states.push(state));
  return { call, track, states };
}

test("an SDP answer only signals negotiation; session.started enables speaking, and stop closes this mission", async t => {
  const ends: string[] = [];
  const { call, track, states } = fixture(t, async (url, body) => {
    assert.equal(body.scopeId, scopeId);
    if (url.endsWith("/start")) { assert.equal(body.sdp, offer); return ok({ scopeId, missionId, sdp: answer, status: "created" }); }
    ends.push(body.missionId); return ok({ scopeId, missionId, status: "closed" });
  });
  await call.start();
  assert.equal(states.at(-1)?.phase, "opening");
  Peer.last!.channel.receive("session.started");
  assert.equal(states.at(-1)?.phase, "connected");
  call.setMuted(true); assert.equal(track.enabled, false);
  await call.stop();
  assert.equal(track.stopped, true);
  assert.equal(states.at(-1)?.phase, "ended");
  assert.deepEqual(ends, [missionId]);
  Peer.last!.channel.receive("session.closed");
  assert.equal(Peer.last!.closed, true);
});

test("a lost response keeps the exact offer and key, then cleans up the original mission", async t => {
  const attempts: Record<string, string>[] = [];
  const { call, track, states } = fixture(t, async (url, body) => {
    if (url.endsWith("/end")) return ok({ scopeId, missionId, status: "closed" });
    attempts.push(body);
    if (attempts.length === 1) throw new Error("connection lost");
    return Response.json({ scopeId, error: "already_requested", missionId }, { status: 409 });
  });
  await call.start();
  assert.equal(states.at(-1)?.phase, "unconfirmed_start");
  assert.equal(track.stopped, true);
  await call.check();
  assert.deepEqual(attempts[0], attempts[1]);
  assert.equal(states.at(-1)?.phase, "ended");
  Peer.last!.channel.receive("session.closed");
});

test("cancel during start stops the microphone immediately and ends a late-created mission", async t => {
  let accepted!: (reply: Response) => void;
  let started!: () => void;
  const dispatched = new Promise<void>(resolve => { started = resolve; });
  let ends = 0;
  const { call, track, states } = fixture(t, async (url, body) => {
    if (url.endsWith("/end")) { assert.equal(body.missionId, missionId); ends++; return ok({ scopeId, missionId, status: "closed" }); }
    started(); return await new Promise<Response>(resolve => { accepted = resolve; });
  });
  const start = call.start();
  await dispatched;
  await call.stop();
  assert.equal(track.stopped, true);
  accepted(ok({ scopeId, missionId, sdp: answer, status: "created" }));
  await start;
  assert.equal(ends, 1);
  assert.equal(states.at(-1)?.phase, "ended");
  Peer.last!.channel.receive("session.closed");
});

test("a failed non-metered preflight stops the microphone without offering to retry an uncertain paid request", async t => {
  const { call, states, track } = fixture(t, async url => {
    assert.ok(url.endsWith("/start"));
    return Response.json({ scopeId, error: "voice_not_ready" }, { status: 503 });
  });
  await call.start();
  assert.equal(states.at(-1)?.phase, "refused");
  assert.equal(track.stopped, true);
  Peer.last!.channel.receive("session.closed");
});

test("a later preflight denial cannot settle a previously lost start", async t => {
  let starts = 0;
  const { call, states } = fixture(t, async () => {
    if (++starts === 1) throw new Error("lost response");
    return Response.json({ scopeId, error: "voice_not_ready" }, { status: 503 });
  });
  await call.start();
  await call.check();
  assert.equal(states.at(-1)?.phase, "unconfirmed_start");
  Peer.last!.channel.receive("session.closed");
});
