// web/js/services/RealtimePreview.js
// Browser-only 8D spatial audio preview using Web Audio API.
// Plays a 10-second excerpt of the uploaded file with live panning via HRTF PannerNode.

const EXCERPT_DURATION = 10; // seconds

export class RealtimePreview {
  /** @type {AudioContext|null} */
  #ctx = null;
  /** @type {AudioBuffer|null} */
  #buffer = null;
  /** @type {AudioBufferSourceNode|null} */
  #source = null;
  /** @type {PannerNode|null} */
  #panner = null;
  /** @type {OscillatorNode|null} */
  #lfo = null;
  /** @type {GainNode|null} */
  #lfoGain = null;
  /** @type {ConvolverNode|null} */
  #reverb = null;
  /** @type {GainNode|null} */
  #wetGain = null;
  /** @type {GainNode|null} */
  #dryGain = null;
  /** @type {boolean} */
  #playing = false;

  /**
   * Decode and cache a 10-second excerpt of the file.
   * Must be called before play().
   * @param {File} file
   */
  async loadExcerpt(file) {
    // Create or reuse AudioContext
    if (!this.#ctx || this.#ctx.state === "closed") {
      this.#ctx = new (window.AudioContext || window.webkitAudioContext)();
    }

    // Resume if suspended (browser autoplay policy)
    if (this.#ctx.state === "suspended") {
      await this.#ctx.resume();
    }

    const arrayBuffer = await file.arrayBuffer();
    const fullBuffer = await this.#ctx.decodeAudioData(arrayBuffer);

    // Trim to first 10 seconds
    const sampleRate = fullBuffer.sampleRate;
    const excerptFrames = Math.min(
      fullBuffer.length,
      Math.floor(sampleRate * EXCERPT_DURATION)
    );

    this.#buffer = this.#ctx.createBuffer(
      fullBuffer.numberOfChannels,
      excerptFrames,
      sampleRate
    );

    for (let ch = 0; ch < fullBuffer.numberOfChannels; ch++) {
      const srcData = fullBuffer.getChannelData(ch);
      const dstData = this.#buffer.getChannelData(ch);
      dstData.set(srcData.subarray(0, excerptFrames));
    }
  }

  /**
   * Start playing the cached excerpt with spatial effects.
   * @param {object} params — { pan_speed, pan_depth, room_size, wet_level, damping }
   */
  play(params) {
    if (!this.#buffer || !this.#ctx) return;
    if (this.#playing) this.stop();

    // Resume context (user gesture needed)
    if (this.#ctx.state === "suspended") {
      this.#ctx.resume();
    }

    // ── Source ────────────────────────────────────────────────
    this.#source = this.#ctx.createBufferSource();
    this.#source.buffer = this.#buffer;
    this.#source.loop = true;

    // ── HRTF Panner ──────────────────────────────────────────
    this.#panner = this.#ctx.createPanner();
    this.#panner.panningModel = "HRTF";
    this.#panner.distanceModel = "inverse";
    this.#panner.refDistance = 1;
    this.#panner.maxDistance = 10000;
    this.#panner.positionZ.value = 0;
    this.#panner.positionY.value = 0;

    // ── LFO drives panner.positionX ──────────────────────────
    // OscillatorNode → GainNode → panner.positionX
    this.#lfo = this.#ctx.createOscillator();
    this.#lfo.type = "sine";
    this.#lfo.frequency.value = params.pan_speed || 0.15;

    this.#lfoGain = this.#ctx.createGain();
    this.#lfoGain.gain.value = (params.pan_depth || 1.0) * 5; // scale depth to spatial range

    this.#lfo.connect(this.#lfoGain);
    this.#lfoGain.connect(this.#panner.positionX);

    // ── Simple convolver reverb (impulse response simulation) ─
    this.#dryGain = this.#ctx.createGain();
    this.#wetGain = this.#ctx.createGain();
    this.#dryGain.gain.value = 1.0 - (params.wet_level || 0.3);
    this.#wetGain.gain.value = params.wet_level || 0.3;

    // Create a simple synthetic impulse response for reverb
    this.#reverb = this.#createImpulseResponse(
      params.room_size || 0.4,
      params.damping || 0.5
    );

    // ── Signal chain ─────────────────────────────────────────
    // Source → Panner → [Dry path → destination]
    //                  → [Reverb → Wet gain → destination]
    this.#source.connect(this.#panner);

    // Dry path
    this.#panner.connect(this.#dryGain);
    this.#dryGain.connect(this.#ctx.destination);

    // Wet path (reverb)
    this.#panner.connect(this.#reverb);
    this.#reverb.connect(this.#wetGain);
    this.#wetGain.connect(this.#ctx.destination);

    // Start
    this.#lfo.start();
    this.#source.start();
    this.#playing = true;

    // Handle end of non-looping playback
    this.#source.onended = () => {
      if (this.#playing) {
        this.#playing = false;
      }
    };
  }

  /**
   * Update effect parameters live without restarting playback.
   * @param {object} params — { pan_speed, pan_depth, room_size, wet_level, damping }
   */
  updateParams(params) {
    if (!this.#playing || !this.#ctx) return;

    const now = this.#ctx.currentTime;

    // Update LFO frequency (pan speed)
    if (this.#lfo && params.pan_speed !== undefined) {
      this.#lfo.frequency.setValueAtTime(params.pan_speed, now);
    }

    // Update LFO gain (pan depth)
    if (this.#lfoGain && params.pan_depth !== undefined) {
      this.#lfoGain.gain.setValueAtTime(params.pan_depth * 5, now);
    }

    // Update wet/dry mix
    if (params.wet_level !== undefined) {
      if (this.#wetGain) this.#wetGain.gain.setValueAtTime(params.wet_level, now);
      if (this.#dryGain) this.#dryGain.gain.setValueAtTime(1.0 - params.wet_level, now);
    }

    // Note: room_size and damping require re-creating the impulse response,
    // which is expensive. We only update them on stop/play cycles.
  }

  /**
   * Stop playback cleanly.
   */
  stop() {
    try {
      if (this.#source) {
        this.#source.onended = null;
        this.#source.stop();
        this.#source.disconnect();
        this.#source = null;
      }
    } catch { /* already stopped */ }

    try {
      if (this.#lfo) {
        this.#lfo.stop();
        this.#lfo.disconnect();
        this.#lfo = null;
      }
    } catch { /* already stopped */ }

    if (this.#lfoGain) { this.#lfoGain.disconnect(); this.#lfoGain = null; }
    if (this.#panner) { this.#panner.disconnect(); this.#panner = null; }
    if (this.#reverb) { this.#reverb.disconnect(); this.#reverb = null; }
    if (this.#wetGain) { this.#wetGain.disconnect(); this.#wetGain = null; }
    if (this.#dryGain) { this.#dryGain.disconnect(); this.#dryGain = null; }

    this.#playing = false;
  }

  /**
   * Full cleanup: stop playback, close AudioContext, drop buffer.
   */
  teardown() {
    this.stop();
    if (this.#ctx && this.#ctx.state !== "closed") {
      this.#ctx.close();
    }
    this.#ctx = null;
    this.#buffer = null;
  }

  /**
   * @returns {boolean}
   */
  get isPlaying() {
    return this.#playing;
  }

  // ── Private: synthetic impulse response ────────────────────

  /**
   * Create a synthetic reverb impulse response.
   * @param {number} roomSize — 0.0–1.0
   * @param {number} damping — 0.0–1.0
   * @returns {ConvolverNode}
   */
  #createImpulseResponse(roomSize, damping) {
    const sampleRate = this.#ctx.sampleRate;
    // Duration scales with room size: 0.5s to 4s
    const duration = 0.5 + roomSize * 3.5;
    const length = Math.floor(sampleRate * duration);
    const impulse = this.#ctx.createBuffer(2, length, sampleRate);

    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        // Exponential decay with damping
        const decay = Math.exp(-i / (length * (0.2 + roomSize * 0.6)));
        // High-frequency damping via simple smoothing
        const dampFactor = 1.0 - damping * 0.7;
        const noise = (Math.random() * 2 - 1) * dampFactor;
        data[i] = noise * decay;
      }
    }

    const convolver = this.#ctx.createConvolver();
    convolver.buffer = impulse;
    return convolver;
  }
}
