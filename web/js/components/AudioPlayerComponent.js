// web/js/components/AudioPlayerComponent.js
import { Component } from "../core/Component.js";

export class AudioPlayerComponent extends Component {
  #audio      = null;
  #ctx        = null;       // AudioContext
  #analyzer   = null;       // AnalyserNode
  #rafId      = null;       // requestAnimationFrame id
  #canvas     = null;
  #canvasCtx  = null;
  #isPlaying  = false;

  constructor() {
    super({ currentTime: 0, duration: 0, isPlaying: false, loading: true });
  }

  render() {
    return `
      <div class="audio-player">
        <p class="player-label">🎧 Preview 8D Audio</p>
        <canvas class="waveform-canvas" id="waveCanvas" height="72"></canvas>
        <div class="player-controls">
          <button class="player-btn-play" id="playBtn" title="Play / Pause">▶</button>
          <input class="player-seek" id="seekBar" type="range"
                 min="0" max="100" value="0" step="0.1">
          <span class="player-time" id="timeDisplay">0:00 / 0:00</span>
        </div>
      </div>`;
  }

  afterMount() {
    this.#canvas    = this.$("#waveCanvas");
    this.#canvasCtx = this.#canvas.getContext("2d");

    const playBtn   = this.$("#playBtn");
    const seekBar   = this.$("#seekBar");
    const timeEl    = this.$("#timeDisplay");

    playBtn.addEventListener("click", () => this.#togglePlay());
    seekBar.addEventListener("input", () => {
      if (this.#audio) {
        this.#audio.currentTime = (seekBar.value / 100) * (this.#audio.duration || 0);
      }
    });
    this.#canvas.addEventListener("click", (e) => {
      if (!this.#audio) return;
      const rect = this.#canvas.getBoundingClientRect();
      const pct  = (e.clientX - rect.left) / rect.width;
      this.#audio.currentTime = pct * (this.#audio.duration || 0);
    });
  }

  /**
   * Load an audio URL into the player.
   * Decodes the audio for waveform rendering AND sets up the <audio> element.
   * @param {string} url - Audio file URL
   */
  async load(url) {
    this.update({ loading: true });

    // ── Create HTML5 audio element ──────────────────────────────
    this.#audio          = new Audio(url);
    this.#audio.crossOrigin = "anonymous";
    this.#audio.preload  = "auto";

    // ── Setup Web Audio API for visualization ────────────────────
    this.#ctx      = new (window.AudioContext || window.webkitAudioContext)();
    this.#analyzer = this.#ctx.createAnalyser();
    this.#analyzer.fftSize = 256;

    const source = this.#ctx.createMediaElementSource(this.#audio);
    source.connect(this.#analyzer);
    this.#analyzer.connect(this.#ctx.destination);

    // ── Wait for metadata + draw static waveform ────────────────
    this.#audio.addEventListener("loadedmetadata", async () => {
      this.update({ duration: this.#audio.duration, loading: false });
      await this.#drawStaticWaveform(url);
    });

    this.#audio.addEventListener("timeupdate", () => {
      const curr    = this.#audio.currentTime;
      const dur     = this.#audio.duration || 1;
      const seekBar = this.$("#seekBar");
      const timeEl  = this.$("#timeDisplay");
      const pct     = (curr / dur) * 100;

      if (seekBar) {
        seekBar.value = pct;
        seekBar.style.setProperty("--seek-progress", `${pct}%`);
      }
      if (timeEl) timeEl.textContent = `${this.#fmt(curr)} / ${this.#fmt(dur)}`;
    });

    this.#audio.addEventListener("ended", () => {
      this.#isPlaying = false;
      const btn = this.$("#playBtn");
      if (btn) btn.textContent = "▶";
    });

    this.#audio.load();
    this.#startLiveVisualizer();
  }

  // ── Draw static waveform from decoded audio data ─────────────
  async #drawStaticWaveform(url) {
    try {
      const response  = await fetch(url);
      const arrayBuf  = await response.arrayBuffer();
      const decodeCtx = new AudioContext();
      const audioBuf  = await decodeCtx.decodeAudioData(arrayBuf);
      const data      = audioBuf.getChannelData(0);   // left channel

      const canvas  = this.#canvas;
      if (!canvas) return;
      const ctx     = this.#canvasCtx;
      const W       = canvas.offsetWidth || 400;
      const H       = 72;
      canvas.width  = W;
      canvas.height = H;

      const step = Math.ceil(data.length / W);
      const mid  = H / 2;

      ctx.clearRect(0, 0, W, H);

      // Draw background waveform bars
      for (let i = 0; i < W; i++) {
        let min = 1, max = -1;
        for (let j = 0; j < step; j++) {
          const d = data[(i * step) + j] || 0;
          if (d < min) min = d;
          if (d > max) max = d;
        }
        const barH = Math.max(2, (max - min) * mid);
        const y    = mid - barH / 2;

        // Gradient color per bar
        const grad = ctx.createLinearGradient(0, y, 0, y + barH);
        grad.addColorStop(0, "rgba(0, 122, 255, 0.8)");
        grad.addColorStop(1, "rgba(90, 200, 250, 0.6)");
        ctx.fillStyle = grad;
        ctx.fillRect(i, y, 1.5, barH);
      }

      await decodeCtx.close();
    } catch (e) {
      // Waveform draw failed — show fallback flat line
      this.#drawFlatLine();
    }
  }

  #drawFlatLine() {
    const canvas = this.#canvas;
    if (!canvas) return;
    canvas.width = canvas.offsetWidth || 400;
    const ctx = this.#canvasCtx;
    ctx.clearRect(0, 0, canvas.width, 72);
    ctx.strokeStyle = "rgba(0, 122, 255, 0.5)";
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.moveTo(0, 36);
    ctx.lineTo(canvas.width, 36);
    ctx.stroke();
  }

  // ── Live frequency visualizer overlay during playback ────────
  #startLiveVisualizer() {
    const draw = () => {
      this.#rafId = requestAnimationFrame(draw);
      if (!this.#isPlaying || !this.#analyzer || !this.#canvas) return;

      const canvas  = this.#canvas;
      const ctx     = this.#canvasCtx;
      const bufLen  = this.#analyzer.frequencyBinCount;
      const dataArr = new Uint8Array(bufLen);
      this.#analyzer.getByteFrequencyData(dataArr);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const barW = (canvas.width / bufLen) * 2.5;
      let x = 0;
      for (let i = 0; i < bufLen; i++) {
        const barH = (dataArr[i] / 255) * canvas.height;
        const hue  = (i / bufLen) * 200 + 200;   // blue→purple range
        ctx.fillStyle = `hsla(${hue}, 80%, 60%, 0.85)`;
        ctx.fillRect(x, canvas.height - barH, barW - 1, barH);
        x += barW;
      }
    };
    draw();
  }

  #togglePlay() {
    if (!this.#audio) return;
    if (this.#ctx?.state === "suspended") this.#ctx.resume();

    if (this.#isPlaying) {
      this.#audio.pause();
      this.#isPlaying = false;
      const btn = this.$("#playBtn");
      if (btn) btn.textContent = "▶";
    } else {
      this.#audio.play();
      this.#isPlaying = true;
      const btn = this.$("#playBtn");
      if (btn) btn.textContent = "⏸";
    }
  }

  #fmt(secs) {
    const s = Math.floor(secs) || 0;
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }

  /** Cleanup on unmount */
  unmount() {
    if (this.#rafId)  cancelAnimationFrame(this.#rafId);
    if (this.#audio)  { this.#audio.pause(); this.#audio.src = ""; }
    if (this.#ctx)    this.#ctx.close();
    super.unmount();
  }
}
