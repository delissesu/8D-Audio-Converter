
const SIZE_THRESHOLD = 10 * 1024 * 1024; // 10 MB

export class BrowserDSP {
  #ctx = null;
  #isRunning = false;
  #abortController = null;

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

  shouldProcessLocally(file) {
    return file.size < SIZE_THRESHOLD;
  }

  async process(file, params, onProgress) {
    this.#abortController = new AbortController();
    this.#isRunning = true;

    try {
      onProgress(0);

      const tempCtx = new (window.AudioContext || window.webkitAudioContext)();
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await tempCtx.decodeAudioData(arrayBuffer);
      await tempCtx.close();

      if (this.#abortController.signal.aborted) throw new DOMException("Aborted", "AbortError");
      onProgress(25);

      const trimStart = params.trim_start || 0;
      const trimEnd = params.trim_end || 0;
      const totalDur = audioBuffer.duration;
      const startSec = Math.max(0, trimStart);
      const endSec = (trimEnd > 0 && trimEnd < totalDur) ? trimEnd : totalDur;
      const trimDuration = Math.max(0.1, endSec - startSec);

      const numChannels = audioBuffer.numberOfChannels;
      const sampleRate = audioBuffer.sampleRate;
      const length = Math.max(1, Math.floor(trimDuration * sampleRate));

      const offlineCtx = new OfflineAudioContext(
        Math.max(2, numChannels),
        length,
        sampleRate
      );

      let useWorklet = false;
      try {
        await offlineCtx.audioWorklet.addModule("/js/worklets/8d_processor.worklet.js");
        useWorklet = true;
      } catch {
        useWorklet = false;
      }

      if (this.#abortController.signal.aborted) throw new DOMException("Aborted", "AbortError");
      onProgress(50);

      const source = offlineCtx.createBufferSource();
      source.buffer = audioBuffer;

      if (useWorklet) {
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
        source.connect(offlineCtx.destination);
      }

      source.start(0, startSec, trimDuration);

      if (this.#abortController.signal.aborted) throw new DOMException("Aborted", "AbortError");
      onProgress(75);

      const renderedBuffer = await offlineCtx.startRendering();

      if (!useWorklet) {
        this.#applyManualEffects(renderedBuffer, params);
      }

      if (this.#abortController.signal.aborted) throw new DOMException("Aborted", "AbortError");
      onProgress(100);

      return this.#encodeWAV(renderedBuffer);

    } finally {
      this.#isRunning = false;
      this.#abortController = null;
    }
  }

  cancel() {
    if (this.#abortController) {
      this.#abortController.abort();
    }
    this.#isRunning = false;
  }

  get isRunning() {
    return this.#isRunning;
  }


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

    this.#writeString(view, 0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    this.#writeString(view, 8, "WAVE");

    this.#writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true);           // chunk size
    view.setUint16(20, 1, true);            // PCM format
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);           // bits per sample

    this.#writeString(view, 36, "data");
    view.setUint32(40, dataSize, true);

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

  #writeString(view, offset, str) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }
}
