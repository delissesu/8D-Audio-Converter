// web/js/services/BrowserDSP.js
// In-browser 8D audio processing using AudioWorklet.
// Processes files < 10MB without sending them to the server.

const SIZE_THRESHOLD = 10 * 1024 * 1024; // 10 MB

export class BrowserDSP {
  /** @type {AudioContext|null} */
  #ctx = null;
  /** @type {AudioWorkletNode|null} */
  #workletNode = null;
  /** @type {boolean} */
  #supported = false;
  /** @type {boolean} */
  #running = false;
  /** @type {AbortController|null} */
  #abortController = null;

  /**
   * Check if AudioWorklet is supported.
   * @returns {Promise<boolean>}
   */
  async isSupported() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const supported = typeof ctx.audioWorklet !== "undefined";
      await ctx.close();
      return supported;
    } catch {
      return false;
    }
  }

  /**
   * Check if a file should be processed in-browser.
   * @param {File} file
   * @returns {boolean}
   */
  shouldProcessLocally(file) {
    return file.size < SIZE_THRESHOLD;
  }

  /**
   * Process a file entirely in-browser using OfflineAudioContext + AudioWorklet.
   * @param {File} file
   * @param {object} params — { pan_speed, pan_depth, room_size, wet_level, damping }
   * @param {function} onProgress — (pct: number) => void
   * @returns {Promise<Blob>} — WAV Blob
   */
  async process(file, params, onProgress) {
    this.#abortController = new AbortController();
    this.#running = true;

    try {
      onProgress(0);

      // Decode the audio file
      const tempCtx = new (window.AudioContext || window.webkitAudioContext)();
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await tempCtx.decodeAudioData(arrayBuffer);
      await tempCtx.close();

      if (this.#abortController.signal.aborted) throw new DOMException("Aborted", "AbortError");
      onProgress(25);

      // Create OfflineAudioContext
      const numChannels = audioBuffer.numberOfChannels;
      const sampleRate = audioBuffer.sampleRate;
      const length = audioBuffer.length;

      const offlineCtx = new OfflineAudioContext(
        Math.max(2, numChannels),
        length,
        sampleRate
      );

      // Try to load AudioWorklet
      let useWorklet = false;
      try {
        await offlineCtx.audioWorklet.addModule("/js/worklets/8d_processor.worklet.js");
        useWorklet = true;
      } catch {
        // AudioWorklet not supported in OfflineAudioContext on some browsers
        useWorklet = false;
      }

      if (this.#abortController.signal.aborted) throw new DOMException("Aborted", "AbortError");
      onProgress(50);

      const source = offlineCtx.createBufferSource();
      source.buffer = audioBuffer;

      if (useWorklet) {
        // Use AudioWorklet path
        const worklet = new AudioWorkletNode(offlineCtx, "spatial-8d-processor");
        worklet.port.postMessage({
          type: "params",
          pan_speed: params.pan_speed || 0.15,
          pan_depth: params.pan_depth || 1.0,
          room_size: params.room_size || 0.4,
          wet_level: params.wet_level || 0.3,
          damping: params.damping || 0.5,
        });

        source.connect(worklet);
        worklet.connect(offlineCtx.destination);
      } else {
        // Fallback: use ScriptProcessor (legacy) or direct passthrough
        // Apply effects in JavaScript after rendering
        source.connect(offlineCtx.destination);
      }

      source.start(0);

      if (this.#abortController.signal.aborted) throw new DOMException("Aborted", "AbortError");
      onProgress(75);

      // Render
      const renderedBuffer = await offlineCtx.startRendering();

      if (!useWorklet) {
        // Apply effects manually if worklet wasn't available
        this.#applyManualEffects(renderedBuffer, params);
      }

      if (this.#abortController.signal.aborted) throw new DOMException("Aborted", "AbortError");
      onProgress(100);

      // Encode to WAV blob
      return this.#encodeWAV(renderedBuffer);

    } finally {
      this.#running = false;
      this.#abortController = null;
    }
  }

  /**
   * Cancel ongoing processing.
   */
  cancel() {
    if (this.#abortController) {
      this.#abortController.abort();
    }
    this.#running = false;
  }

  /**
   * @returns {boolean}
   */
  get isRunning() {
    return this.#running;
  }

  // ── Private helpers ────────────────────────────────────────

  /**
   * Apply 8D effects manually (fallback for browsers without AudioWorklet in OfflineContext).
   * @param {AudioBuffer} buffer
   * @param {object} params
   */
  #applyManualEffects(buffer, params) {
    const sr = buffer.sampleRate;
    const panSpeed = params.pan_speed || 0.15;
    const panDepth = params.pan_depth || 1.0;
    const numFrames = buffer.length;

    const left = buffer.getChannelData(0);
    const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : left;

    for (let i = 0; i < numFrames; i++) {
      const t = i / sr;
      const panRaw = Math.sin(2 * Math.PI * panSpeed * t) * panDepth;
      const panPos = (panRaw + 1.0) / 2.0;
      const angle = panPos * (Math.PI / 2.0);

      left[i] *= Math.cos(angle);
      right[i] *= Math.sin(angle);
    }
  }

  /**
   * Encode an AudioBuffer as a WAV Blob.
   * @param {AudioBuffer} buffer
   * @returns {Blob}
   */
  #encodeWAV(buffer) {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const numFrames = buffer.length;
    const bytesPerSample = 2; // PCM 16-bit
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = numFrames * blockAlign;
    const headerSize = 44;

    const wavBuffer = new ArrayBuffer(headerSize + dataSize);
    const view = new DataView(wavBuffer);

    // RIFF header
    this.#writeString(view, 0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    this.#writeString(view, 8, "WAVE");

    // fmt chunk
    this.#writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true);           // chunk size
    view.setUint16(20, 1, true);            // PCM format
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);           // bits per sample

    // data chunk
    this.#writeString(view, 36, "data");
    view.setUint32(40, dataSize, true);

    // Interleave channels and write PCM 16-bit samples
    let offset = 44;
    const channels = [];
    for (let ch = 0; ch < numChannels; ch++) {
      channels.push(buffer.getChannelData(ch));
    }

    for (let i = 0; i < numFrames; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        let sample = channels[ch][i];
        sample = Math.max(-1, Math.min(1, sample));
        const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        view.setInt16(offset, int16, true);
        offset += 2;
      }
    }

    return new Blob([wavBuffer], { type: "audio/wav" });
  }

  /**
   * @param {DataView} view
   * @param {number} offset
   * @param {string} str
   */
  #writeString(view, offset, str) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }
}
