// web/js/components/DropZoneComponent.js
import { Component } from "../core/Component.js";

export class DropZoneComponent extends Component {
  #fileInput = null;

  constructor() {
    super({ filename: null });
  }

  render() {
    const { filename } = this.state;
    return `
      <div class="drop-zone card" id="dropZoneInner">
        <div id="dzContent">
          ${filename
            ? `<div class="drop-zone__selected">🎵 <span>${filename}</span></div>`
            : `<span class="drop-zone__icon">🎧</span>
               <p class="drop-zone__title">Drop your audio file here</p>
               <p class="drop-zone__sub">or click to browse · MP3, WAV, FLAC, OGG</p>`
          }
        </div>
        <input id="fileInputEl" type="file"
               accept=".mp3,.wav,.flac,.ogg,.aac,.m4a" style="display:none;">
      </div>`;
  }

  afterMount() {
    this.#fileInput = this.$("#fileInputEl");
    const zone      = this.$("#dropZoneInner");

    zone.addEventListener("click",      () => this.#fileInput.click());
    this.#fileInput.addEventListener("change", (e) => this.#handle(e.target.files[0]));
    zone.addEventListener("dragover",   (e) => { e.preventDefault(); zone.classList.add("drag-over"); });
    zone.addEventListener("dragleave",  ()  => zone.classList.remove("drag-over"));
    zone.addEventListener("drop",       (e) => {
      e.preventDefault();
      zone.classList.remove("drag-over");
      this.#handle(e.dataTransfer.files[0]);
    });
  }

  #handle(file) {
    if (!file) return;
    this.update({ filename: file.name });
    this.emit("file:selected", file);   // broadcast to EventBus
  }
}
