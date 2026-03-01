// web/js/worklets/8d_processor.worklet.js
// AudioWorklet processor for real-time 8D audio spatial processing.
// Runs in a separate audio thread — no DOM access, no imports.

class SpatialProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._phase = 0;
    this._panSpeed = 0.15;
    this._panDepth = 1.0;
    this._roomSize = 0.4;
    this._wetLevel = 0.3;
    this._damping = 0.5;

    // Simple delay buffer for Haas-like width
    this._delayBuffer = new Float32Array(4096);
    this._delayWritePos = 0;

    this.port.onmessage = (e) => {
      if (e.data.type === "params") {
        this._panSpeed = e.data.pan_speed ?? this._panSpeed;
        this._panDepth = e.data.pan_depth ?? this._panDepth;
        this._roomSize = e.data.room_size ?? this._roomSize;
        this._wetLevel = e.data.wet_level ?? this._wetLevel;
        this._damping = e.data.damping ?? this._damping;
      }
    };
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];

    if (!input || !input[0] || !output || !output[0]) return true;

    const left = input[0];
    const right = input.length > 1 ? input[1] : input[0];
    const outLeft = output[0];
    const outRight = output.length > 1 ? output[1] : output[0];

    const sr = sampleRate;
    const phaseIncrement = this._panSpeed / sr;

    for (let i = 0; i < left.length; i++) {
      // Sinusoidal panning
      const panRaw = Math.sin(2 * Math.PI * this._phase) * this._panDepth;
      const panPos = (panRaw + 1.0) / 2.0;
      const angle = panPos * (Math.PI / 2.0);
      const leftGain = Math.cos(angle);
      const rightGain = Math.sin(angle);

      // Apply panning
      let l = left[i] * leftGain;
      let r = right[i] * rightGain;

      // Simple reverb approximation (feedback comb filter)
      const delaySamples = Math.floor(this._roomSize * 2048 + 128);
      const readPos = (this._delayWritePos - delaySamples + this._delayBuffer.length) % this._delayBuffer.length;
      const delayed = this._delayBuffer[readPos];

      // Mix delay feedback
      const feedback = this._roomSize * 0.6 * (1.0 - this._damping * 0.5);
      this._delayBuffer[this._delayWritePos] = (l + r) * 0.5 + delayed * feedback;
      this._delayWritePos = (this._delayWritePos + 1) % this._delayBuffer.length;

      // Wet/dry mix
      const wet = this._wetLevel;
      outLeft[i] = l * (1.0 - wet) + delayed * wet;
      outRight[i] = r * (1.0 - wet) + delayed * wet;

      this._phase += phaseIncrement;
      if (this._phase >= 1.0) this._phase -= 1.0;
    }

    return true;
  }
}

registerProcessor("spatial-8d-processor", SpatialProcessor);
