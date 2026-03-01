// web/js/components/WaveformEditorComponent.js
// Full waveform display with draggable trim handles.
// Emits "trim:changed" with { start, end } on EventBus.

import { EventBus } from "../core/EventBus.js";

export class WaveformEditorComponent {
  /** @type {HTMLElement|null} */
  #container = null;
  /** @type {EventBus} */
  #bus = null;
  /** @type {HTMLCanvasElement|null} */
  #canvas = null;
  /** @type {CanvasRenderingContext2D|null} */
  #ctx = null;
  /** @type {Float32Array|null} */
  #peaks = null;
  /** @type {number} */
  #duration = 0;
  /** @type {number} */
  #trimStart = 0;
  /** @type {number} */
  #trimEnd = 0;
  /** @type {string|null} */
  #dragging = null; // "start" | "end" | "middle" | null
  /** @type {number} */
  #draggingOffset = 0;
  /** @type {boolean} */
  #visible = false;
  /** @type {AudioContext|null} */
  #audioCtx = null;

  constructor() {
    this.#bus = EventBus.getInstance();
  }

  /**
   * Mount into a DOM container.
   * @param {HTMLElement} container
   */
  mount(container) {
    this.#container = container;

    this.#bus.on("file:selected", (file) => {
      this.#decodeAndRender(file);
    });

    this.#bus.on("app:reset", () => {
      this.#reset();
    });
  }

  /**
   * Clean up.
   */
  unmount() {
    this.#reset();
    if (this.#audioCtx && this.#audioCtx.state !== "closed") {
      this.#audioCtx.close();
    }
    this.#audioCtx = null;
    if (this.#container) this.#container.innerHTML = "";
    this.#container = null;
  }

  /**
   * Get current trim values in seconds.
   * @returns {{ start: number, end: number }}
   */
  getTrimValues() {
    return {
      start: this.#trimStart,
      end: this.#trimEnd,
    };
  }

  // ── Private ────────────────────────────────────────────────

  async #decodeAndRender(file) {
    if (!this.#container) return;

    try {
      // Decode audio
      if (!this.#audioCtx || this.#audioCtx.state === "closed") {
        this.#audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }

      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await this.#audioCtx.decodeAudioData(arrayBuffer);

      this.#duration = audioBuffer.duration;
      this.#trimStart = 0;
      this.#trimEnd = this.#duration;

      // Extract peaks
      const data = audioBuffer.getChannelData(0);
      const numPeaks = 200;
      const step = Math.ceil(data.length / numPeaks);
      this.#peaks = new Float32Array(numPeaks);

      for (let i = 0; i < numPeaks; i++) {
        let max = 0;
        for (let j = 0; j < step; j++) {
          const v = Math.abs(data[i * step + j] || 0);
          if (v > max) max = v;
        }
        this.#peaks[i] = max;
      }

      this.#visible = true;
      this.#renderUI();
      this.#drawWaveform();
      this.#emitTrim();

    } catch (err) {
      console.warn("WaveformEditor: decode failed", err);
    }
  }

  #reset() {
    this.#peaks = null;
    this.#duration = 0;
    this.#trimStart = 0;
    this.#trimEnd = 0;
    this.#dragging = null;
    this.#visible = false;
    if (this.#container) this.#container.innerHTML = "";
  }

  #renderUI() {
    if (!this.#container || !this.#visible) return;

    this.#container.innerHTML = `
      <div class="waveform-editor">
        <div class="waveform-editor__header">
          <span class="waveform-editor__title">
            <span class="material-symbols-outlined" style="font-size:16px">content_cut</span>
            Trim Audio
          </span>
          <button id="waveform-reset" class="waveform-editor__reset">Reset</button>
        </div>
        <div class="waveform-editor__canvas-wrap" id="waveform-canvas-wrap">
          <canvas id="waveform-canvas"></canvas>
          <div class="waveform-editor__handle waveform-editor__handle--start" id="waveform-handle-start" tabindex="0" role="slider" aria-label="Trim start" aria-valuemin="0" aria-valuemax="${this.#duration}"></div>
          <div class="waveform-editor__handle waveform-editor__handle--end" id="waveform-handle-end" tabindex="0" role="slider" aria-label="Trim end" aria-valuemin="0" aria-valuemax="${this.#duration}"></div>
          <div id="waveform-middle-region" style="position: absolute; top: 0; bottom: 0; cursor: grab; z-index: 5;"></div>
          <div class="waveform-editor__overlay waveform-editor__overlay--left" id="waveform-overlay-left"></div>
          <div class="waveform-editor__overlay waveform-editor__overlay--right" id="waveform-overlay-right"></div>
        </div>
        <div class="waveform-editor__times">
          <span id="waveform-start-time" class="waveform-editor__time">${this.#formatTime(this.#trimStart)}</span>
          <span class="waveform-editor__duration">${this.#formatTime(this.#trimEnd - this.#trimStart)}</span>
          <span id="waveform-end-time" class="waveform-editor__time">${this.#formatTime(this.#trimEnd)}</span>
        </div>
      </div>
    `;

    this.#canvas = this.#container.querySelector("#waveform-canvas");
    this.#ctx = this.#canvas.getContext("2d");

    this.#setupCanvas();
    this.#attachHandleListeners();
    this.#updateHandlePositions();
  }

  #setupCanvas() {
    const wrap = this.#container.querySelector("#waveform-canvas-wrap");
    const dpr = window.devicePixelRatio || 1;
    const rect = wrap.getBoundingClientRect();
    const w = rect.width;
    const h = 80;

    this.#canvas.width = w * dpr;
    this.#canvas.height = h * dpr;
    this.#canvas.style.width = w + "px";
    this.#canvas.style.height = h + "px";
    this.#ctx.scale(dpr, dpr);
  }

  #drawWaveform() {
    if (!this.#ctx || !this.#peaks || !this.#canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const w = this.#canvas.width / dpr;
    const h = this.#canvas.height / dpr;

    this.#ctx.clearRect(0, 0, w, h);

    const barWidth = w / this.#peaks.length;
    const mid = h / 2;

    for (let i = 0; i < this.#peaks.length; i++) {
      const peak = this.#peaks[i];
      const barH = Math.max(2, peak * mid * 0.9);
      const x = i * barWidth;

      // Color: selected region is blue, outside is gray
      const timePct = i / this.#peaks.length;
      const startPct = this.#trimStart / this.#duration;
      const endPct = this.#trimEnd / this.#duration;

      if (timePct >= startPct && timePct <= endPct) {
        this.#ctx.fillStyle = "#0071E3";
      } else {
        this.#ctx.fillStyle = "#D1D1D6";
      }

      this.#ctx.fillRect(x + 1, mid - barH, barWidth - 2, barH * 2);
    }
  }

  #attachHandleListeners() {
    const handleStart = this.#container.querySelector("#waveform-handle-start");
    const handleEnd = this.#container.querySelector("#waveform-handle-end");
    const wrap = this.#container.querySelector("#waveform-canvas-wrap");
    const resetBtn = this.#container.querySelector("#waveform-reset");

    const middleRegion = this.#container.querySelector("#waveform-middle-region");

    // Mouse/Touch drag
    const startDrag = (handleId) => (e) => {
      e.preventDefault();
      this.#dragging = handleId;

      const rect = wrap.getBoundingClientRect();
      const initialClientX = e.touches ? e.touches[0].clientX : e.clientX;
      const initialPct = Math.min(1, Math.max(0, (initialClientX - rect.left) / rect.width));
      this.#draggingOffset = initialPct * this.#duration - this.#trimStart;

      const onMove = (moveEvent) => {
        const clientX = moveEvent.touches ? moveEvent.touches[0].clientX : moveEvent.clientX;
        if (this.#dragging === "middle") {
          const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
          const time = pct * this.#duration;
          const newStart = time - this.#draggingOffset;
          const dur = this.#trimEnd - this.#trimStart;
          
          if (newStart >= 0 && newStart + dur <= this.#duration) {
            this.#trimStart = newStart;
            this.#trimEnd = newStart + dur;
            this.#onTrimChanged();
          } else if (newStart < 0) {
            this.#trimStart = 0;
            this.#trimEnd = dur;
            this.#onTrimChanged();
          } else if (newStart + dur > this.#duration) {
            this.#trimStart = this.#duration - dur;
            this.#trimEnd = this.#duration;
            this.#onTrimChanged();
          }
        } else {
            this.#handleDragMove(clientX, wrap);
        }
      };

      const onUp = () => {
        this.#dragging = null;
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.removeEventListener("touchmove", onMove);
        document.removeEventListener("touchend", onUp);
      };

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      document.addEventListener("touchmove", onMove, { passive: false });
      document.addEventListener("touchend", onUp);
    };

    handleStart?.addEventListener("mousedown", startDrag("start"));
    handleStart?.addEventListener("touchstart", startDrag("start"), { passive: false });
    handleEnd?.addEventListener("mousedown", startDrag("end"));
    handleEnd?.addEventListener("touchstart", startDrag("end"), { passive: false });
    middleRegion?.addEventListener("mousedown", startDrag("middle"));
    middleRegion?.addEventListener("touchstart", startDrag("middle"), { passive: false });

    // Keyboard: arrow keys
    handleStart?.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") {
        this.#trimStart = Math.min(this.#trimStart + 0.5, this.#trimEnd - 0.1);
        this.#onTrimChanged();
      } else if (e.key === "ArrowLeft") {
        this.#trimStart = Math.max(this.#trimStart - 0.5, 0);
        this.#onTrimChanged();
      }
    });

    handleEnd?.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") {
        this.#trimEnd = Math.min(this.#trimEnd + 0.5, this.#duration);
        this.#onTrimChanged();
      } else if (e.key === "ArrowLeft") {
        this.#trimEnd = Math.max(this.#trimEnd - 0.5, this.#trimStart + 0.1);
        this.#onTrimChanged();
      }
    });

    // Reset button
    resetBtn?.addEventListener("click", () => {
      this.#trimStart = 0;
      this.#trimEnd = this.#duration;
      this.#onTrimChanged();
    });
  }

  #handleDragMove(clientX, wrap) {
    if (!this.#dragging) return;

    const rect = wrap.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const time = pct * this.#duration;

    if (this.#dragging === "start") {
      this.#trimStart = Math.min(time, this.#trimEnd - 0.1);
      this.#trimStart = Math.max(0, this.#trimStart);
    } else if (this.#dragging === "end") {
      this.#trimEnd = Math.max(time, this.#trimStart + 0.1);
      this.#trimEnd = Math.min(this.#duration, this.#trimEnd);
    }

    this.#onTrimChanged();
  }

  #onTrimChanged() {
    this.#updateHandlePositions();
    this.#drawWaveform();
    this.#updateTimeLabels();
    this.#emitTrim();
  }

  #updateHandlePositions() {
    if (!this.#duration) return;

    const startPct = (this.#trimStart / this.#duration) * 100;
    const endPct = (this.#trimEnd / this.#duration) * 100;

    const handleStart = this.#container?.querySelector("#waveform-handle-start");
    const handleEnd = this.#container?.querySelector("#waveform-handle-end");
    const overlayLeft = this.#container?.querySelector("#waveform-overlay-left");
    const overlayRight = this.#container?.querySelector("#waveform-overlay-right");
    const middleRegion = this.#container?.querySelector("#waveform-middle-region");

    if (handleStart) handleStart.style.left = `${startPct}%`;
    if (handleEnd) handleEnd.style.left = `${endPct}%`;
    if (overlayLeft) overlayLeft.style.width = `${startPct}%`;
    if (overlayRight) overlayRight.style.width = `${100 - endPct}%`;
    if (middleRegion) {
      middleRegion.style.left = `${startPct}%`;
      middleRegion.style.width = `${endPct - startPct}%`;
    }
  }

  #updateTimeLabels() {
    const startLabel = this.#container?.querySelector("#waveform-start-time");
    const endLabel = this.#container?.querySelector("#waveform-end-time");
    const durationLabel = this.#container?.querySelector(".waveform-editor__duration");

    if (startLabel) startLabel.textContent = this.#formatTime(this.#trimStart);
    if (endLabel) endLabel.textContent = this.#formatTime(this.#trimEnd);
    if (durationLabel) durationLabel.textContent = this.#formatTime(this.#trimEnd - this.#trimStart);
  }

  #emitTrim() {
    this.#bus.emit("trim:changed", {
      start: this.#trimStart,
      end: this.#trimEnd,
    });
  }

  /**
   * Format seconds to MM:SS.s
   * @param {number} sec
   * @returns {string}
   */
  #formatTime(sec) {
    if (sec < 0) sec = 0;
    const m = Math.floor(sec / 60);
    const s = (sec % 60).toFixed(1);
    return `${m}:${s.padStart(4, "0")}`;
  }
}
