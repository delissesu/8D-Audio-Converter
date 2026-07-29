
export class RealtimePreview {
  #ctx = null;
  #buffer = null;
  #source = null;
  #lfoNode = null;
  #reverb = null;
  #wetGain = null;
  #dryGain = null;
  #isPlaying = false;
  #isWorkletReady = false;

  #duration = 0;

  async loadExcerpt(file, trim = { start: 0, end: 0 }) {
    if (!this.#ctx || this.#ctx.state === "closed") {
      this.#ctx = new (window.AudioContext || window.webkitAudioContext)();
    }

    if (this.#ctx.state === "suspended") {
      await this.#ctx.resume();
    }

    const arrayBuffer = await file.arrayBuffer();
    const fullBuffer = await this.#ctx.decodeAudioData(arrayBuffer);

    const sampleRate = fullBuffer.sampleRate;
    const duration = fullBuffer.duration;

    const maxPreviewDuration = 60;
    const previewDuration = duration < maxPreviewDuration ? duration : maxPreviewDuration;

    const previewStart = trim.start > 0 ? trim.start : 0;
    const previewEnd = Math.min(previewStart + previewDuration, duration);

    const startFrame = Math.floor(previewStart * sampleRate);
    const endFrame = Math.floor(previewEnd * sampleRate);
    const frameCount = Math.max(1, endFrame - startFrame);

    this.#buffer = this.#ctx.createBuffer(
      fullBuffer.numberOfChannels,
      frameCount,
      sampleRate
    );

    for (let ch = 0; ch < fullBuffer.numberOfChannels; ch++) {
      const srcData = fullBuffer.getChannelData(ch);
      const dstData = this.#buffer.getChannelData(ch);
      dstData.set(srcData.subarray(startFrame, endFrame));
    }

    this.#duration = previewEnd - previewStart;
  }

  async play(params) {
    this.stop();   // always stop first to prevent overlapping audio
    if (!this.#buffer || !this.#ctx) return;

    if (this.#ctx.state === "suspended") {
      await this.#ctx.resume();
    }

    if (!this.#isWorkletReady) {
      try {
        await this.#ctx.audioWorklet.addModule("/js/worklets/lfo_panner.worklet.js");
        this.#isWorkletReady = true;
      } catch (err) {
        console.warn("AudioWorklet not available, preview disabled:", err);
        return;
      }
    }

    this.#source = this.#ctx.createBufferSource();
    this.#source.buffer = this.#buffer;
    this.#source.loop = true;

    this.#lfoNode = new AudioWorkletNode(this.#ctx, "lfo-panner", {
      outputChannelCount: [2],
    });
    this.#lfoNode.parameters.get("panSpeed").value = params.pan_speed || 0.15;
    this.#lfoNode.parameters.get("panDepth").value = params.pan_depth || 1.0;

    this.#dryGain = this.#ctx.createGain();
    this.#wetGain = this.#ctx.createGain();
    this.#dryGain.gain.value = 1.0 - (params.wet_level || 0.3);
    this.#wetGain.gain.value = params.wet_level || 0.3;

    this.#reverb = this.#createImpulseResponse(
      params.room_size || 0.4,
      params.damping || 0.5
    );

    this.#source.connect(this.#lfoNode);

    this.#lfoNode.connect(this.#dryGain);
    this.#dryGain.connect(this.#ctx.destination);

    this.#lfoNode.connect(this.#reverb);
    this.#reverb.connect(this.#wetGain);
    this.#wetGain.connect(this.#ctx.destination);

    this.#source.start();
    this.#isPlaying = true;

    this.#source.onended = () => {
      if (this.#isPlaying) {
        this.#isPlaying = false;
      }
    };
  }

  updateParams(params) {
    if (!this.#isPlaying || !this.#ctx) return;

    const now = this.#ctx.currentTime;

    if (this.#lfoNode) {
      if (params.pan_speed !== undefined) {
        this.#lfoNode.parameters.get("panSpeed").setValueAtTime(params.pan_speed, now);
      }
      if (params.pan_depth !== undefined) {
        this.#lfoNode.parameters.get("panDepth").setValueAtTime(params.pan_depth, now);
      }
    }

    if (params.wet_level !== undefined) {
      if (this.#wetGain) this.#wetGain.gain.setValueAtTime(params.wet_level, now);
      if (this.#dryGain) this.#dryGain.gain.setValueAtTime(1.0 - params.wet_level, now);
    }

  }

  stop() {
    try {
      if (this.#source) {
        this.#source.onended = null;
        this.#source.stop();
        this.#source.disconnect();
        this.#source = null;
      }
    } catch {  }

    if (this.#lfoNode) { this.#lfoNode.disconnect(); this.#lfoNode = null; }
    if (this.#reverb) { this.#reverb.disconnect(); this.#reverb = null; }
    if (this.#wetGain) { this.#wetGain.disconnect(); this.#wetGain = null; }
    if (this.#dryGain) { this.#dryGain.disconnect(); this.#dryGain = null; }

    this.#isPlaying = false;
  }

  teardown() {
    this.stop();
    if (this.#ctx && this.#ctx.state !== "closed") {
      this.#ctx.close();
    }
    this.#ctx = null;
    this.#buffer = null;
    this.#isWorkletReady = false;
  }

  get isPlaying() {
    return this.#isPlaying;
  }


  #createImpulseResponse(roomSize, damping) {
    const sampleRate = this.#ctx.sampleRate;
    const tailSeconds = 0.3 + roomSize * 3.2 * (1.2 - damping);
    const length = Math.floor(sampleRate * Math.max(0.3, tailSeconds));
    const impulse = this.#ctx.createBuffer(2, length, sampleRate);

    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        const t     = i / length;
        const decay = Math.pow(1.0 - damping * 0.85, t * 120);
        const early = t < 0.05 ? (1.0 - t / 0.05) * 0.3 : 0;
        data[i]     = (Math.random() * 2 - 1) * (decay + early);
      }
    }

    const convolver = this.#ctx.createConvolver();
    convolver.buffer = impulse;
    return convolver;
  }
}
