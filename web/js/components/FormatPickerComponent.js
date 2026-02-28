// web/js/components/FormatPickerComponent.js
import { Component } from "../core/Component.js";

const FORMATS = ["mp3", "wav", "flac", "ogg"];

export class FormatPickerComponent extends Component {
  constructor() { super({ selected: "mp3" }); }

  render() {
    const { selected } = this.state;
    return `
      <div class="format-row">
        <span class="format-row__label">Format</span>
        <div class="segmented-control" style="flex:1;">
          ${FORMATS.map((f) => `
            <button class="segmented-control__btn ${f === selected ? "active" : ""}"
                    data-format="${f}">${f.toUpperCase()}</button>
          `).join("")}
        </div>
      </div>`;
  }

  afterMount() {
    this.$$(".segmented-control__btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.update({ selected: btn.dataset.format });
        this.emit("format:changed", btn.dataset.format);
      });
    });
  }

  get selected() { return this.state.selected; }
}
