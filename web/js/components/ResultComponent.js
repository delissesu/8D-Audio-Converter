// web/js/components/ResultComponent.js
import { Component } from "../core/Component.js";

export class ResultComponent extends Component {
  constructor() {
    super({ downloadUrl: null, filename: "", format: "", sizeMb: 0, elapsed: 0 });
  }

  render() {
    const { downloadUrl, filename, format, sizeMb, elapsed } = this.state;
    return `
      <div class="state-card visible">
        <span class="state-card__icon">✅</span>
        <h2 class="state-card__title">Conversion Complete</h2>
        <div style="text-align:left; padding: 0 var(--space-4) var(--space-4);">
          <div id="audioPlayerSlot"></div>
        </div>
        <div style="padding: 0 var(--space-4) var(--space-2); font-size:var(--text-footnote);
                    color:var(--label-secondary); display:flex; gap:16px; justify-content:center;">
          <span>🎵 ${format}</span>
          <span>💾 ${sizeMb.toFixed(2)} MB</span>
          <span>⏱ ${elapsed.toFixed(1)}s</span>
        </div>
        <div style="padding: var(--space-4); display:flex; flex-direction:column; gap:var(--space-3);">
          <a id="downloadBtn" class="btn btn-download"
             href="${downloadUrl}" download="${filename}">
            ⬇  Download ${format}
          </a>
          <button id="retryBtn" class="btn btn-ghost">🔄  Convert Another</button>
        </div>
      </div>`;
  }

  afterMount() {
    this.$("#retryBtn")?.addEventListener("click", () => this.emit("app:reset"));
  }

  /** Returns the slot element where AudioPlayerComponent will be mounted */
  get playerSlot() { return this.$("#audioPlayerSlot"); }
}
