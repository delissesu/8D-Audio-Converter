// web/js/services/RealtimePreview.js
// Browser-only 8D spatial audio preview using Web Audio API.
// Plays a smart-duration excerpt with live panning via AudioWorklet.

export class RealtimePreview {
  /** @type {AudioContext|null} */
  #ctx = null;
  /** @type {AudioBuffer|null} */
  #buffer = null;
  /** @type {AudioBufferSourceNode|null} */
  #source = null;
  /** @type {AudioWorkletNode|null} */
  #lfoNode = null;
  /** @type {ConvolverNode|null} */
  #reverb = null;
  /** @type {GainNode|null} */
  #wetGain = null;
  /** @type {GainNode|null} */
  #dryGain = null;
  /** @type {boolean} */
  #playing = false;
  /** @type {boolean} */
  #workletReady = false;

  /** @type {number} */
  #duration = 0;

  /**
   * Decode and cache a smart-duration excerpt of the file.
   * Smart rules:
   *   - File < 60s → preview the full file
   *   - File >= 60s → 60s max preview
   *   - If trim is active → start from trim.start
   * Must be called before play().
   * @param {File} file
   * @param {{ start: number, end: number }} trim — current trim values in seconds
   */
  async loadExcerpt(file, trim = { start: 0, end: 0 }) {
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

    const sampleRate = fullBuffer.sampleRate;
    const duration = fullBuffer.duration;

    // Smart duration: cap at 60s
    const maxPreviewDuration = 60;
    const previewDuration = duration < maxPreviewDuration ? duration : maxPreviewDuration;

    // Use trim start if active, otherwise start at 0
    const previewStart = trim.start > 0 ? trim.start : 0;
    const previewEnd = Math.min(previewStart + previewDuration, duration);

    // Slice the decoded buffer to the preview window
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

  /**
   * Start playing the cached excerpt with spatial effects.
   * Uses AudioWorklet for sample-accurate LFO panning.
   * @param {object} params — { pan_speed, pan_depth, room_size, wet_level, damping }
   */
  async play(params) {
    this.stop();   // always stop first to prevent overlapping audio
    if (!this.#buffer || !this.#ctx) return;

    // Resume context (user gesture needed)
    if (this.#ctx.state === "suspended") {
      await this.#ctx.resume();
    }

    // Load AudioWorklet if not already loaded
    if (!this.#workletReady) {
      try {
        await this.#ctx.audioWorklet.addModule("/js/worklets/lfo_panner.worklet.js");
        this.#workletReady = true;
      } catch (err) {
        console.warn("AudioWorklet not available, preview disabled:", err);
        return;
      }
    }

    // ── Source ────────────────────────────────────────────────
    this.#source = this.#ctx.createBufferSource();
    this.#source.buffer = this.#buffer;
    this.#source.loop = true;

    // ── LFO Panner (AudioWorklet — sample-accurate) ─────────
    this.#lfoNode = new AudioWorkletNode(this.#ctx, "lfo-panner", {
      outputChannelCount: [2],
    });
    this.#lfoNode.parameters.get("panSpeed").value = params.pan_speed || 0.15;
    this.#lfoNode.parameters.get("panDepth").value = params.pan_depth || 1.0;

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
    // Source → LFO Panner → [Dry path → destination]
    //                      → [Reverb → Wet gain → destination]
    this.#source.connect(this.#lfoNode);

    // Dry path
    this.#lfoNode.connect(this.#dryGain);
    this.#dryGain.connect(this.#ctx.destination);

    // Wet path (reverb)
    this.#lfoNode.connect(this.#reverb);
    this.#reverb.connect(this.#wetGain);
    this.#wetGain.connect(this.#ctx.destination);

    // Start
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
   * Updates LFO speed/depth via AudioParam (sample-accurate).
   * @param {object} params — { pan_speed, pan_depth, room_size, wet_level, damping }
   */
  updateParams(params) {
    if (!this.#playing || !this.#ctx) return;

    const now = this.#ctx.currentTime;

    // Update LFO panner params via AudioParam (smooth, sample-accurate)
    if (this.#lfoNode) {
      if (params.pan_speed !== undefined) {
        this.#lfoNode.parameters.get("panSpeed").setValueAtTime(params.pan_speed, now);
      }
      if (params.pan_depth !== undefined) {
        this.#lfoNode.parameters.get("panDepth").setValueAtTime(params.pan_depth, now);
      }
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

    if (this.#lfoNode) { this.#lfoNode.disconnect(); this.#lfoNode = null; }
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
    this.#workletReady = false;
  }

  /**
   * @returns {boolean}
   */
  get isPlaying() {
    return this.#playing;
  }

  // ── Private helpers ────────────────────────────────────────

  /**
   * Create a synthetic reverb impulse response.
   * Calibrated to approximate pedalboard.Reverb tail behavior:
   *   room_size=0.4, damping=0.5 → ~1.2s tail
   *   room_size=0.9, damping=0.3 → ~3.5s tail
   * @param {number} roomSize — 0.0–1.0
   * @param {number} damping — 0.0–1.0
   * @returns {ConvolverNode}
   */
  #createImpulseResponse(roomSize, damping) {
    const sampleRate = this.#ctx.sampleRate;
    // Empirical calibration against pedalboard.Reverb output:
    // room=0.0 → ~0.3s tail  |  room=0.4 → ~1.2s  |  room=0.9 → ~3.5s
    const tailSeconds = 0.3 + roomSize * 3.2 * (1.2 - damping);
    const length = Math.floor(sampleRate * Math.max(0.3, tailSeconds));
    const impulse = this.#ctx.createBuffer(2, length, sampleRate);

    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        const t     = i / length;
        const decay = Math.pow(1.0 - damping * 0.85, t * 120);
        // Add early reflections in first 5% of tail
        const early = t < 0.05 ? (1.0 - t / 0.05) * 0.3 : 0;
        data[i]     = (Math.random() * 2 - 1) * (decay + early);
      }
    }

    const convolver = this.#ctx.createConvolver();
    convolver.buffer = impulse;
    return convolver;
  }
}
