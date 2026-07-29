
class LFOPannerProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "panSpeed", defaultValue: 0.15, minValue: 0.01, maxValue: 2.0 },
      { name: "panDepth", defaultValue: 1.0,  minValue: 0.0,  maxValue: 1.0 },
    ];
  }

  constructor() {
    super();
    this._phase = 0;
  }

  process(inputs, outputs, parameters) {
    const input  = inputs[0];
    const output = outputs[0];

    if (!input || !input[0] || !output || !output[0]) return true;

    const inLeft   = input[0];
    const inRight  = input.length > 1 ? input[1] : input[0];
    const outLeft  = output[0];
    const outRight = output.length > 1 ? output[1] : output[0];

    const blockSize = inLeft.length;

    for (let i = 0; i < blockSize; i++) {
      const speed = parameters.panSpeed.length > 1
        ? parameters.panSpeed[i]
        : parameters.panSpeed[0];
      const depth = parameters.panDepth.length > 1
        ? parameters.panDepth[i]
        : parameters.panDepth[0];

      const pan = Math.sin(2 * Math.PI * speed * this._phase / sampleRate) * depth;

      const panPos = (pan + 1.0) / 2.0;
      const angle  = panPos * (Math.PI / 2.0);
      const leftGain  = Math.cos(angle);
      const rightGain = Math.sin(angle);

      outLeft[i]  = inLeft[i]  * leftGain;
      outRight[i] = inRight[i] * rightGain;

      this._phase++;
    }

    return true;
  }
}

registerProcessor("lfo-panner", LFOPannerProcessor);
