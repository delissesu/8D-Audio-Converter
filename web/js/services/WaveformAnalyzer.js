
export class WaveformAnalyzer {
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
