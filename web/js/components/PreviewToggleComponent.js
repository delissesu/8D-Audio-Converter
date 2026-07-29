
import { EventBus } from "../core/EventBus.js";

export class PreviewToggleComponent {
  #container = null;
  #bus = null;
  #isActive = false;
  #isLoading = false;
  #isFileReady = false;

  constructor() {
    this.#bus = EventBus.getInstance();
  }

  mount(container) {
    this.#container = container;
    this.#render();

    this.#bus.on("preview:loaded", () => {
      this.#isLoading = false;
      this.#render();
    });

    this.#bus.on("preview:error", () => {
      this.#isLoading = false;
      this.#isActive = false;
      this.#render();
    });

    this.#bus.on("file:selected", () => {
      this.#isFileReady = true;
      this.#render();
    });

    this.#bus.on("app:reset", () => {
      this.#isActive = false;
      this.#isLoading = false;
      this.#isFileReady = false;
      this.#render();
    });
  }

  unmount() {
    if (this.#isActive) {
      this.#bus.emit("preview:stop");
    }
    if (this.#container) this.#container.innerHTML = "";
    this.#container = null;
  }

  setInactive() {
    if (this.#isActive) {
      this.#isActive = false;
      this.#isLoading = false;
      this.#render();
    }
  }


  #render() {
    if (!this.#container) return;

    const disabled = !this.#isFileReady || this.#isLoading;
    const activeClass = this.#isActive ? "preview-toggle--active" : "";
    const disabledAttr = disabled ? "disabled" : "";

    const icon = this.#isLoading
      ? "hourglass_top"
      : this.#isActive
        ? "stop_circle"
        : "headphones";

    const label = this.#isLoading
      ? "Loading preview..."
      : this.#isActive
        ? "Stop Preview"
        : "Preview with Headphones";

    this.#container.innerHTML = `
      <button id="btn-preview-toggle"
              class="preview-toggle ${activeClass}"
              ${disabledAttr}
              title="${this.#isFileReady ? label : 'Upload a file first'}">
        <span class="material-symbols-outlined preview-toggle__icon">${icon}</span>
        <span class="preview-toggle__label">${label}</span>
        ${this.#isActive ? '<span class="preview-toggle__pulse"></span>' : ''}
      </button>
      <div style="font-size: 0.75rem; color: #9ca3af; margin-top: 0.5rem; text-align: center;">
        Preview gives an approximation of the spatial effect.
        The converted file will sound fuller and more accurate.
        Use headphones for best preview results.
      </div>
    `;

    this.#attachListeners();
  }

  #attachListeners() {
    const btn = this.#container?.querySelector("#btn-preview-toggle");
    if (!btn) return;

    btn.addEventListener("click", () => {
      if (this.#isLoading) return;

      if (this.#isActive) {
        this.#isActive = false;
        this.#bus.emit("preview:stop");
      } else {
        this.#isActive = true;
        this.#isLoading = true;
        this.#bus.emit("preview:start");
      }
      this.#render();
    });
  }
}
