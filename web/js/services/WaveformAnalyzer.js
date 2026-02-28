// web/js/services/WaveformAnalyzer.js
// Decodes audio file to raw PCM amplitude data for canvas rendering.
// Used independently of AudioPlayerComponent for pre-decode if needed.

export class WaveformAnalyzer {
  /**
   * Decode audio URL and return normalized amplitude samples.
   * @param {string} url - Audio URL
   * @param {number} samples - Number of data points to return
   * @returns {Promise<Float32Array>} — amplitude values in [-1, 1]
   */
  async analyze(url, samples = 800) {
    const response  = await fetch(url);
    const arrayBuf  = await response.arrayBuffer();
    const ctx       = new AudioContext();
    const audioBuf  = await ctx.decodeAudioData(arrayBuf);
    const data      = audioBuf.getChannelData(0);
    const step      = Math.ceil(data.length / samples);
    const output    = new Float32Array(samples);

    for (let i = 0; i < samples; i++) {
      let max = 0;
      for (let j = 0; j < step; j++) {
        const abs = Math.abs(data[i * step + j] || 0);
        if (abs > max) max = abs;
      }
      output[i] = max;
    }
    await ctx.close();
    return output;
  }
}
