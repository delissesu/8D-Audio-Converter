// web/js/components/ProgressComponent.js
import { Component } from "../core/Component.js";

export class ProgressComponent extends Component {
  constructor() { super({ progress: 0, step: "Preparing..." }); }

  render() {
    const { progress, step } = this.state;
    return `
      <div class="state-card visible" style="padding: var(--space-6);">
        <div class="state-card__icon">⚙️</div>
        <h2 class="state-card__title">Converting your audio...</h2>
        <div class="progress-wrap" style="padding: 0; margin: 16px 0 0;">
          <div class="progress-bar-track">
            <div class="progress-bar-fill" style="width: ${progress}%;"></div>
          </div>
          <p class="progress-step-label">${step}</p>
          <p class="progress-pct">${progress}%</p>
        </div>
      </div>`;
  }

  setProgress(progress, step) { this.update({ progress, step }); }
}
