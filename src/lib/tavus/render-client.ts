import { readRenderRoom, renderRoomDurationSeconds, scopeIdPattern } from "./render-contract.ts";

const endpoint = "/api/eden/tavus-render";
const sampleRate = 24_000;
// A 40 ms chunk is 1,920 PCM bytes and fits within Daily's 4 KB app-message limit after Base64 and JSON.
const frameBytes = sampleRate * 2 / 25;
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const silence = encode(new Uint8Array(frameBytes));

// A fresh Daily call object or a wrapper around it. The host supplies the SDK.
export type DailyRenderCall = {
  join: (options: { url: string; token: string; startAudioOff: true; startVideoOff: true; audioSource: false; videoSource: false }) => Promise<unknown>;
  sendAppMessage: (message: object, recipient: string) => unknown;
  destroy: () => Promise<unknown>;
};

export class TavusRenderClient {
  private readonly requestId = crypto.randomUUID();
  private conversationId?: string;
  private participant?: string;
  private videoTrack?: MediaStreamTrack;
  private inferenceId?: string;
  private startAttempted = false;
  private roomMayExist = false;
  private joined = false;
  private closed = false;
  private destroyed = false;
  private deadline?: ReturnType<typeof setTimeout>;
  private closing?: Promise<void>;
  private readonly abort = new AbortController();
  private readonly scopeId: string;
  private readonly call: DailyRenderCall;
  private readonly video: HTMLVideoElement;

  constructor(scopeId: string, call: DailyRenderCall, video: HTMLVideoElement) {
    if (!scopeIdPattern.test(scopeId)) throw new Error("Invalid render workspace scope");
    this.scopeId = scopeId;
    this.call = call;
    this.video = video;
    this.video.muted = true;
    this.video.autoplay = true;
    this.video.playsInline = true;
  }

  async start() {
    if (this.startAttempted || this.closed) throw new Error("Render client has already been used");
    this.startAttempted = true;
    this.roomMayExist = true;
    try {
      const response = await this.request("POST");
      if (!response.ok) {
        const failure: unknown = await response.json().catch(() => null);
        this.roomMayExist = !failure || typeof failure !== "object" || !("error" in failure) ||
          failure.error === "tavus_render_start_unconfirmed";
        throw new Error("Render start failed (" + response.status + ")");
      }
      const payload = await response.json();
      const room = readRenderRoom(payload);
      if (!room || room.requestId !== this.requestId || payload.scopeId !== this.scopeId ||
          payload.maxDurationSeconds !== renderRoomDurationSeconds) throw new Error("Invalid render-room receipt");
      this.abort.signal.throwIfAborted();
      this.conversationId = room.conversationId;
      this.deadline = setTimeout(() => {
        // The provider also enforces its own time and no-participant limits.
        void this.close().catch(() => {});
      }, renderRoomDurationSeconds * 1000);
      await this.join(room.conversationUrl, room.meetingToken);
      this.abort.signal.throwIfAborted();
      this.joined = true;
    } catch (error) {
      await this.close().catch(() => {});
      throw error;
    }
  }

  /** Pass the PAL's remote camera track and its Daily session_id after joining the private room. */
  attachAvatarVideo(participantSessionId: string, track: MediaStreamTrack) {
    if (this.closed || !this.conversationId || track.kind !== "video" || track.readyState !== "live" ||
        !/^[A-Za-z0-9_.-]{1,128}$/.test(participantSessionId)) throw new Error("Invalid Tavus video track");
    if (this.participant && this.participant !== participantSessionId) throw new Error("Tavus participant changed");
    if (this.videoTrack === track) return;
    this.video.srcObject = new MediaStream([track]);
    this.participant = participantSessionId;
    this.videoTrack = track;
  }

  get ready() {
    return this.joined && !!this.participant && !this.closed;
  }

  /** Supply only confirmed OpenAI Gleam output, in 24 kHz mono PCM16LE Base64. */
  sendGleamAudio(delta: string) {
    if (!this.ready) throw new Error("Tavus renderer is unavailable");
    if (!delta.length || delta.length > 65_536 || !/^[A-Za-z0-9+/]+={0,2}$/.test(delta)) throw new Error("Invalid Gleam audio");
    const pcm = Uint8Array.from(atob(delta), (byte) => byte.charCodeAt(0));
    if (!pcm.length || pcm.length % 2) throw new Error("Invalid PCM16 audio");
    const inferenceId = this.inferenceId ??= crypto.randomUUID();
    for (let offset = 0; offset < pcm.length; offset += frameBytes) {
      this.sendEcho(inferenceId, encode(pcm.subarray(offset, offset + frameBytes)), false);
    }
  }

  finishUtterance() {
    if (!this.inferenceId) return;
    this.sendEcho(this.inferenceId, silence, true);
    this.inferenceId = undefined;
  }

  interrupt() {
    this.inferenceId = undefined;
    this.send("conversation.interrupt");
  }

  private sendEcho(inferenceId: string, audio: string, done: boolean) {
    this.send("conversation.echo", { modality: "audio", audio, sample_rate: sampleRate, inference_id: inferenceId, done });
  }

  private send(eventType: "conversation.echo" | "conversation.interrupt", properties?: object) {
    if (this.closed || !this.joined || !this.conversationId || !this.participant) throw new Error("Tavus renderer is unavailable");
    this.call.sendAppMessage({
      message_type: "conversation", event_type: eventType, conversation_id: this.conversationId,
      ...(properties && { properties }),
    }, "*");
  }

  close(): Promise<void> {
    if (this.closing) return this.closing;
    this.closed = true;
    this.abort.abort();
    clearTimeout(this.deadline);
    this.video.srcObject = null;
    this.videoTrack = undefined;
    this.closing = this.release().finally(() => { this.closing = undefined; });
    return this.closing;
  }

  private async release() {
    const destroy = async () => {
      if (this.destroyed) return;
      await this.call.destroy();
      this.destroyed = true;
    };
    const end = async () => {
      if (!this.roomMayExist) return;
      const response = await this.request("DELETE");
      if (response.status !== 200) throw new Error("Tavus room close was not confirmed (" + response.status + ")");
      this.roomMayExist = false;
    };
    const [local, server] = await Promise.allSettled([destroy(), end()]);
    if (server.status === "rejected") throw server.reason;
    if (local.status === "rejected") throw new Error("Daily media cleanup failed");
  }

  private async join(url: string, token: string) {
    const signal = AbortSignal.any([this.abort.signal, AbortSignal.timeout(15_000)]);
    let onAbort: (() => void) | undefined;
    try {
      await Promise.race([
        new Promise<never>((_, reject) => {
          onAbort = () => reject(signal.reason);
          signal.addEventListener("abort", onAbort, { once: true });
        }),
        this.call.join({ url, token, startAudioOff: true, startVideoOff: true, audioSource: false, videoSource: false }),
      ]);
    } finally {
      if (onAbort) signal.removeEventListener("abort", onAbort);
    }
  }

  private request(method: "POST" | "DELETE") {
    const timeout = AbortSignal.timeout(method === "POST" ? 45_000 : 25_000);
    return fetch(endpoint, {
      method, cache: "no-store", credentials: "same-origin", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: this.requestId, scopeId: this.scopeId }),
      keepalive: method === "DELETE",
      signal: method === "POST" ? AbortSignal.any([timeout, this.abort.signal]) : timeout,
    });
  }
}
