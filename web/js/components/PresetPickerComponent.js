// web/js/components/PresetPickerComponent.js
// UI for selecting, saving, deleting, and sharing audio effect presets.
// Uses the EventBus for communication — emits "preset:loaded" when a preset is applied.

import { EventBus } from "../core/EventBus.js";
import { PresetManager } from "../services/PresetManager.js";

// ── Security helper ──────────────────────────────────────────────
function escapeHTML(str) {
  const el = document.createElement("div");
  el.appendChild(document.createTextNode(str));
  return el.innerHTML;
}

export class PresetPickerComponent {
  /** @type {HTMLElement} */
  #container = null;
  /** @type {PresetManager} */
  #manager = null;
  /** @type {EventBus} */
  #bus = null;
  /** @type {string|null} */
  #activePreset = null;
  /** @type {boolean} */
  #showSaveInput = false;
  /** @type {HTMLElement|null} */
  #toast = null;
  /** @type {number|null} */
  #toastTimer = null;

  constructor() {
    this.#manager = new PresetManager();
    this.#bus = EventBus.getInstance();
  }

  /**
   * Mount the preset picker into a DOM container.
   * @param {HTMLElement} container
   */
  mount(container) {
    this.#container = container;
    this.#createToast();
    this.#render();
  }

  /**
   * Re-render the preset list (call after external state changes).
   */
  refresh() {
    this.#render();
  }

  /**
   * Get the PresetManager instance for external access.
   * @returns {PresetManager}
   */
  get manager() {
    return this.#manager;
  }

  /**
   * Clean up (remove toast element).
   */
  unmount() {
    if (this.#toast && this.#toast.parentNode) {
      this.#toast.parentNode.removeChild(this.#toast);
    }
    if (this.#toastTimer) clearTimeout(this.#toastTimer);
    if (this.#container) this.#container.innerHTML = "";
  }

  // ── Private: Rendering ─────────────────────────────────────────

  #render() {
    if (!this.#container) return;

    const presets = this.#manager.getAll();

    let html = `<div class="preset-picker">`;

    // Header
    html += `
      <div class="preset-picker__header">
        <span class="preset-picker__title">Presets</span>
        <button id="preset-toggle-save" class="preset-save-row__btn preset-save-row__btn--${this.#showSaveInput ? 'cancel' : 'save'}" 
                style="height:28px; padding:0 12px; font-size:0.75rem;">
          ${this.#showSaveInput ? 'Cancel' : '＋ Save Current'}
        </button>
      </div>`;

    // Save input row (toggle visibility)
    if (this.#showSaveInput) {
      html += `
        <div class="preset-save-row">
          <input type="text" id="preset-name-input" class="preset-save-row__input"
                 placeholder="Enter preset name..." maxlength="30" autocomplete="off" />
          <button id="preset-btn-save" class="preset-save-row__btn preset-save-row__btn--save">Save</button>
        </div>`;
    }

    // Preset grid
    html += `<div class="preset-grid">`;

    for (const preset of presets) {
      const isActive = this.#activePreset === preset.name;
      const chipClass = [
        "preset-chip",
        isActive ? "preset-chip--active" : "",
        preset.isBuiltin ? "preset-chip--builtin" : "",
      ].filter(Boolean).join(" ");

      const icon = preset.isBuiltin ? "auto_awesome" : "tune";

      html += `
        <div class="${chipClass}" data-preset-name="${escapeHTML(preset.name)}" data-action="load">
          <span class="material-symbols-outlined preset-chip__icon">${icon}</span>
          <span class="preset-chip__name">${escapeHTML(preset.name)}</span>
          <span class="preset-chip__actions">
            <button class="preset-chip__btn" data-action="share" data-preset-name="${escapeHTML(preset.name)}" title="Copy share link">
              <span class="material-symbols-outlined" style="font-size:14px">link</span>
            </button>
            ${!preset.isBuiltin ? `
              <button class="preset-chip__btn preset-chip__btn--delete" data-action="delete" data-preset-name="${escapeHTML(preset.name)}" title="Delete preset">
                <span class="material-symbols-outlined" style="font-size:14px">close</span>
              </button>
            ` : ""}
          </span>
        </div>`;
    }

    html += `</div></div>`;

    this.#container.innerHTML = html;
    this.#attachListeners();
  }

  // ── Private: Event listeners ───────────────────────────────────

  #attachListeners() {
    // Toggle save input
    const toggleBtn = this.#container.querySelector("#preset-toggle-save");
    if (toggleBtn) {
      toggleBtn.addEventListener("click", () => {
        this.#showSaveInput = !this.#showSaveInput;
        this.#render();
        // Auto-focus input if now visible
        if (this.#showSaveInput) {
          const input = this.#container.querySelector("#preset-name-input");
          if (input) input.focus();
        }
      });
    }

    // Save button
    const saveBtn = this.#container.querySelector("#preset-btn-save");
    if (saveBtn) {
      saveBtn.addEventListener("click", () => this.#handleSave());
    }

    // Save on Enter key
    const nameInput = this.#container.querySelector("#preset-name-input");
    if (nameInput) {
      nameInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") this.#handleSave();
        if (e.key === "Escape") {
          this.#showSaveInput = false;
          this.#render();
        }
      });
    }

    // Preset chips — delegate clicks
    const chips = this.#container.querySelectorAll("[data-action]");
    for (const el of chips) {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const action = el.dataset.action;
        const name = el.dataset.presetName;

        if (action === "load") {
          this.#handleLoad(name);
        } else if (action === "share") {
          this.#handleShare(name);
        } else if (action === "delete") {
          this.#handleDelete(name);
        }
      });
    }
  }

  // ── Private: Action handlers ───────────────────────────────────

  #handleLoad(name) {
    const params = this.#manager.get(name);
    if (!params) return;

    this.#activePreset = name;
    this.#bus.emit("preset:loaded", params);
    this.#render();
  }

  #handleSave() {
    const input = this.#container.querySelector("#preset-name-input");
    if (!input) return;

    const name = input.value.trim();
    if (!name) {
      input.focus();
      return;
    }

    // Request current params from app.js via EventBus
    // We'll use a synchronous callback approach
    let currentParams = null;
    const handler = (params) => { currentParams = params; };
    this.#bus.on("preset:request-params-response", handler);
    this.#bus.emit("preset:request-params");
    this.#bus.off("preset:request-params-response", handler);

    if (!currentParams) return;

    const saved = this.#manager.save(name, currentParams);
    if (!saved) {
      this.#showToast("Cannot overwrite a built-in preset");
      return;
    }

    this.#activePreset = name;
    this.#showSaveInput = false;
    this.#showToast(`✅  Preset "${name}" saved`);
    this.#render();
  }

  #handleShare(name) {
    const url = this.#manager.getShareUrl(name);
    if (!url) return;

    navigator.clipboard.writeText(url).then(() => {
      this.#showToast("✅  Share link copied to clipboard!");
    }).catch(() => {
      // Fallback: select and copy
      const input = document.createElement("input");
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      this.#showToast("✅  Share link copied!");
    });
  }

  #handleDelete(name) {
    const deleted = this.#manager.delete(name);
    if (!deleted) return;

    if (this.#activePreset === name) {
      this.#activePreset = null;
    }
    this.#showToast(`Preset "${name}" deleted`);
    this.#render();
  }

  // ── Private: Toast ─────────────────────────────────────────────

  #createToast() {
    if (this.#toast) return;
    this.#toast = document.createElement("div");
    this.#toast.className = "preset-toast";
    document.body.appendChild(this.#toast);
  }

  #showToast(message) {
    if (!this.#toast) return;
    if (this.#toastTimer) clearTimeout(this.#toastTimer);

    this.#toast.textContent = message;
    this.#toast.classList.add("preset-toast--visible");

    this.#toastTimer = setTimeout(() => {
      this.#toast.classList.remove("preset-toast--visible");
      this.#toastTimer = null;
    }, 2500);
  }
}
