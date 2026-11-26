// A call owns its microphone, peer and server mission. It never changes workspace.
type Phase = 'opening' | 'connected' | 'ended' | 'pending' | 'unconfirmed_start' | 'refused';
export type VoiceUpdate = { phase: Phase; message: string; receiptId?: string };
export type VoiceReadiness = { scopeId: string; voice: string; ready: boolean; reasoningReady: boolean };
const scopePattern = /^[a-f0-9]{64}$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const endpoint = '/api/eden/media/voice/';

export function readVoiceReadiness(data: unknown): VoiceReadiness | null {
  if (typeof data !== 'object' || data === null || !('scopeId' in data) || typeof data.scopeId !== 'string' || !scopePattern.test(data.scopeId)) return null;
  const voice = 'voice' in data && typeof data.voice === 'string' ? data.voice : '';
  const ready = 'canStartVoice' in data && data.canStartVoice === true
    && 'voiceModelAccessVerified' in data && data.voiceModelAccessVerified === true
    && 'serverControlsConnected' in data && data.serverControlsConnected === true;
  const reasoningReady = 'nativeReasoningReady' in data && data.nativeReasoningReady === true;
  return { scopeId: data.scopeId, voice, ready, reasoningReady };
}

export function iceGathered(pc: RTCPeerConnection, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    function done() {
      if (signal.aborted || pc.iceGatheringState === 'complete') {
        signal.removeEventListener('abort', done);
        pc.removeEventListener('icegatheringstatechange', done);
        if (signal.aborted) reject(new Error('cancelled'));
        else resolve();
      }
    }
    signal.addEventListener('abort', done);
    pc.addEventListener('icegatheringstatechange', done);
    done();
  });
}

async function post(route: string, body: object, keepalive = false) {
  const response = await fetch(endpoint + route, { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), keepalive, signal: AbortSignal.timeout(35_000) });
  const data = await response.json();
  return { response, data };
}

export class VoiceConnection {
  private stream?: MediaStream;
  private pc?: RTCPeerConnection;
  private channel?: RTCDataChannel;
  private missionId?: string;
  private offer?: string;
  private dispatched = false;
  private confirmedStarted = false;
  private closeInFlight = false;
  private startInFlight = false;
  private timeout?: ReturnType<typeof setTimeout>;
  private abort = new AbortController();
  private readonly requestKey = crypto.randomUUID();

  private scopeId: string;
  private audio: HTMLAudioElement;
  private update: (state: VoiceUpdate) => void;

  constructor(scopeId: string, audio: HTMLAudioElement, update: (state: VoiceUpdate) => void) {
    this.scopeId = scopeId;
    this.audio = audio;
    this.update = update;
  }

  async start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true }, video: false });
      if (this.abort.signal.aborted) { stream.getTracks().forEach(t => t.stop()); return; }
      this.stream = stream;
      const pc = this.pc = new RTCPeerConnection();
      stream.getAudioTracks().forEach(track => pc.addTrack(track, stream));
      this.audio.srcObject = new MediaStream();
      pc.ontrack = ({ track }) => {
        if (this.abort.signal.aborted || track.kind !== 'audio') return;
        (this.audio.srcObject as MediaStream).addTrack(track);
        void this.audio.play().catch(() => { /* Native audio controls allow manual playback. */ });
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') void this.stop();
      };
      const channel = this.channel = pc.createDataChannel('oai-events');
      channel.onmessage = ({ data }) => {
        let event;
        try { event = JSON.parse(data); } catch { return; }
        if (event?.type === 'session.started' && !this.abort.signal.aborted) {
          clearTimeout(this.timeout);
          this.confirmedStarted = true;
          this.update({ phase: 'connected', message: 'Voice session connected. Your microphone is on.' });
        }
        if (event?.type === 'session.closed' && !this.abort.signal.aborted) void this.stop();
      };
      channel.onclose = () => { if (!this.abort.signal.aborted) void this.stop(); };
      await pc.setLocalDescription(await pc.createOffer());
      await iceGathered(pc, AbortSignal.any([this.abort.signal, AbortSignal.timeout(8_000)]));
      const offer = pc.localDescription?.sdp;
      if (!offer || offer.length > 12_000 || this.abort.signal.aborted) throw new Error('invalid_offer');
      this.offer = offer;
      this.dispatched = true;
      this.startInFlight = true;
      try { await this.requestStart(); } finally { this.startInFlight = false; }
    } catch {
      if (this.dispatched && !this.missionId) {
        this.releaseDevice();
        this.update({ phase: 'unconfirmed_start', message: 'The microphone is off. Retrying the same request may briefly start a metered session if Core never received it. It will be closed immediately.' });
      } else if (this.missionId) await this.stop();
      else if (!this.abort.signal.aborted) {
        this.releaseDevice();
        this.update({ phase: 'refused', message: 'The microphone or voice connection could not open. Check microphone permission and try again.' });
      }
    }
  }

  private async requestStart(recovering = false) {
    const { response, data } = await post('start', { scopeId: this.scopeId, requestKey: this.requestKey, sdp: this.offer });
    if ((response.ok || data?.missionId) && data?.scopeId !== this.scopeId) throw new Error('unexpected_workspace');
    if (typeof data?.missionId === 'string' && uuid.test(data.missionId)) this.missionId = data.missionId;
    if (!response.ok) {
      if (this.missionId) { await this.stop(); return; }
      // A rejected replay cannot settle what happened to the earlier request.
      if (recovering) throw new Error('original_start_unconfirmed');
      if (data?.error !== 'voice_not_ready' && (response.status >= 500 || response.status === 409)) throw new Error('unconfirmed');
      this.dispatched = false;
      this.offer = undefined;
      this.releaseDevice();
      this.update({ phase: 'refused', message: data?.error === 'voice_not_ready'
        ? 'The workspace voice connection is unavailable. No call started.'
        : 'Core declined this voice request. Check your account and voice access.' });
      return;
    }
    if (!this.missionId || data?.status !== 'created' || typeof data.sdp !== 'string' || !/^v=0\r?\n/.test(data.sdp)) throw new Error('invalid_answer');
    this.offer = undefined;
    if (this.abort.signal.aborted || !this.pc) { await this.stop(); return; }
    this.update({ phase: 'opening', message: 'Connecting your audio…', receiptId: typeof data.receiptId === 'string' ? data.receiptId : undefined });
    this.timeout = setTimeout(() => { if (!this.confirmedStarted) void this.stop(); }, 15_000);
    await this.pc.setRemoteDescription({ type: 'answer', sdp: data.sdp });
  }

  setMuted(muted: boolean) { this.stream?.getAudioTracks().forEach(track => { track.enabled = !muted; }); }

  private releaseDevice() {
    if (this.abort.signal.aborted) return;
    this.abort.abort();
    clearTimeout(this.timeout);
    this.stream?.getTracks().forEach(track => track.stop());
    this.audio.pause();
    this.audio.srcObject = null;
    const pc = this.pc;
    const channel = this.channel;
    if (pc && channel?.readyState === 'open') {
      // Let the final session.closed event arrive before dropping transport.
      // Core observes the authoritative usage receipt on its own control connection.
      const timeout = setTimeout(() => pc.close(), 3_000);
      channel.addEventListener('message', event => {
        try {
          if (JSON.parse(event.data)?.type === 'session.closed') {
            clearTimeout(timeout); pc.close();
          }
        } catch { /* Other data-channel events are irrelevant during close. */ }
      });
      try { channel.send(JSON.stringify({ type: 'session.close' })); }
      catch { clearTimeout(timeout); pc.close(); }
    } else pc?.close();
  }

  async stop() {
    this.releaseDevice();
    if (!this.missionId) {
      this.update(this.dispatched ? { phase: 'pending', message: 'Microphone off. Waiting for Core to identify the call.' } : { phase: 'ended', message: 'Microphone off.' });
      return;
    }
    if (this.closeInFlight) return;
    this.closeInFlight = true;
    this.update({ phase: 'pending', message: 'Microphone off. Confirming the end of the call…' });
    try {
      const { response, data } = await post('end', { scopeId: this.scopeId, missionId: this.missionId }, true);
      if (response.ok && data?.scopeId === this.scopeId && data?.missionId === this.missionId && data.status === 'closed') {
        this.update({ phase: 'ended', message: 'Call ended. Core confirmed the session closed.' });
      } else { this.update({ phase: 'pending', message: 'Microphone off. Core has not yet confirmed the call closed.' }); }
    } catch { this.update({ phase: 'pending', message: 'Microphone off. Reconnect to check the end of the call.' }); }
    finally { this.closeInFlight = false; }
  }

  async check() {
    if (this.missionId) { await this.stop(); return; }
    if (this.startInFlight || !this.offer) return;
    this.startInFlight = true;
    try { await this.requestStart(true); }
    catch { this.update({ phase: 'unconfirmed_start', message: 'The original start is still unconfirmed. A retry can briefly use voice minutes if it reaches Core for the first time.' }); }
    finally { this.startInFlight = false; }
  }
}
