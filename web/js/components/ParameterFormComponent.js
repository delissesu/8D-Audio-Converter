// web/js/components/ParameterFormComponent.js
import { Component } from "../core/Component.js";

const PARAMS = [
  { id: "speed",   label: "Speed",   min: 0.01, max: 2.0,  step: 0.01, default: 0.15 },
  { id: "depth",   label: "Depth",   min: 0.0,  max: 1.0,  step: 0.01, default: 1.0  },
  { id: "room",    label: "Room",    min: 0.0,  max: 1.0,  step: 0.01, default: 0.4  },
  { id: "wet",     label: "Wet",     min: 0.0,  max: 1.0,  step: 0.01, default: 0.3  },
  { id: "damping", label: "Damping", min: 0.0,  max: 1.0,  step: 0.01, default: 0.5  },
];

export class ParameterFormComponent extends Component {
  render() {
    return PARAMS.map((p) => `
      <div class="param-row">
        <span class="param-label">${p.label}</span>
        <input class="param-slider" type="range" data-id="${p.id}"
               min="${p.min}" max="${p.max}" step="${p.step}" value="${p.default}">
        <span class="param-value" data-val="${p.id}">${p.default.toFixed(2)}</span>
      </div>`
    ).join("");
  }

  afterMount() {
    this.$$(".param-slider").forEach((slider) => {
      this.#updateTrack(slider);
      slider.addEventListener("input", () => {
        const valEl = this.$(`[data-val="${slider.dataset.id}"]`);
        if (valEl) valEl.textContent = parseFloat(slider.value).toFixed(2);
        this.#updateTrack(slider);
      });
    });
  }

  #updateTrack(slider) {
    const pct = ((slider.value - slider.min) / (slider.max - slider.min)) * 100;
    slider.style.setProperty("--progress", `${pct}%`);
  }

  getValues() {
    const out = {};
    this.$$(".param-slider").forEach((s) => { out[s.dataset.id] = parseFloat(s.value); });
    return out;
  }

  reset() {
    PARAMS.forEach((p) => {
      const slider = this.$(`[data-id="${p.id}"]`);
      const valEl  = this.$(`[data-val="${p.id}"]`);
      if (slider) { slider.value = p.default; this.#updateTrack(slider); }
      if (valEl)  valEl.textContent = p.default.toFixed(2);
    });
  }
}
