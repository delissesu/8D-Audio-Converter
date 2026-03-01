// web/js/components/PreviewToggleComponent.js
// Toggle button for activating/deactivating the real-time 8D audio preview.
// Emits "preview:start" and "preview:stop" on EventBus.

import { EventBus } from "../core/EventBus.js";

export class PreviewToggleComponent {
  /** @type {HTMLElement|null} */
  #container = null;
  /** @type {EventBus} */
  #bus = null;
  /** @type {boolean} */
  #active = false;
  /** @type {boolean} */
  #loading = false;
  /** @type {boolean} */
  #fileReady = false;

  constructor() {
    this.#bus = EventBus.getInstance();
  }

  /**
   * Mount into a DOM container.
   * @param {HTMLElement} container
   */
  mount(container) {
    this.#container = container;
    this.#render();

    // Listen for external state changes
    this.#bus.on("preview:loaded", () => {
      this.#loading = false;
      this.#render();
    });

    this.#bus.on("preview:error", () => {
      this.#loading = false;
      this.#active = false;
      this.#render();
    });

    this.#bus.on("file:selected", () => {
      this.#fileReady = true;
      this.#render();
    });

    this.#bus.on("app:reset", () => {
      this.#active = false;
      this.#loading = false;
      this.#fileReady = false;
      this.#render();
    });
  }

  /**
   * Clean up.
   */
  unmount() {
    if (this.#active) {
      this.#bus.emit("preview:stop");
    }
    if (this.#container) this.#container.innerHTML = "";
    this.#container = null;
  }

  // ── Private ────────────────────────────────────────────────

  #render() {
    if (!this.#container) return;

    const disabled = !this.#fileReady || this.#loading;
    const activeClass = this.#active ? "preview-toggle--active" : "";
    const disabledAttr = disabled ? "disabled" : "";

    const icon = this.#loading
      ? "hourglass_top"
      : this.#active
        ? "stop_circle"
        : "headphones";

    const label = this.#loading
      ? "Loading preview..."
      : this.#active
        ? "Stop Preview"
        : "Preview with Headphones";

    this.#container.innerHTML = `
      <button id="btn-preview-toggle"
              class="preview-toggle ${activeClass}"
              ${disabledAttr}
              title="${this.#fileReady ? label : 'Upload a file first'}">
        <span class="material-symbols-outlined preview-toggle__icon">${icon}</span>
        <span class="preview-toggle__label">${label}</span>
        ${this.#active ? '<span class="preview-toggle__pulse"></span>' : ''}
      </button>
    `;

    this.#attachListeners();
  }

  #attachListeners() {
    const btn = this.#container?.querySelector("#btn-preview-toggle");
    if (!btn) return;

    btn.addEventListener("click", () => {
      if (this.#loading) return;

      if (this.#active) {
        this.#active = false;
        this.#bus.emit("preview:stop");
      } else {
        this.#active = true;
        this.#loading = true;
        this.#bus.emit("preview:start");
      }
      this.#render();
    });
  }
}
