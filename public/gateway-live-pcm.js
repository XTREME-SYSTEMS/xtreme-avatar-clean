class GatewayLivePcm extends AudioWorkletProcessor {
  constructor() {
    super();
    this.frame = new Int16Array(480);
    this.offset = 0;
  }

  process(inputs) {
    for (const sample of inputs[0]?.[0] ?? []) {
      const value = Math.max(-1, Math.min(1, sample));
      this.frame[this.offset++] = value < 0 ? value * 32768 : value * 32767;
      if (this.offset === this.frame.length) {
        this.port.postMessage(this.frame.buffer, [this.frame.buffer]);
        this.frame = new Int16Array(480);
        this.offset = 0;
      }
    }
    return true;
  }
}

registerProcessor("gateway-live-pcm", GatewayLivePcm);
