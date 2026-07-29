
import { EventBus } from "../core/EventBus.js";
import { PresetManager } from "../services/PresetManager.js";

function escapeHTML(str) {
  const el = document.createElement("div");
  el.appendChild(document.createTextNode(str));
  return el.innerHTML;
}

export class PresetPickerComponent {
  #container = null;
  #manager = null;
  #bus = null;
  #activePreset = null;
  #shouldShowSaveInput = false;
  #toast = null;
  #toastTimer = null;

  constructor() {
    this.#manager = new PresetManager();
    this.#bus = EventBus.getInstance();
  }

  mount(container) {
    this.#container = container;
    this.#createToast();
    this.#render();
  }

  refresh() {
    this.#render();
  }

  get manager() {
    return this.#manager;
  }

  unmount() {
    if (this.#toast && this.#toast.parentNode) {
      this.#toast.parentNode.removeChild(this.#toast);
    }
    if (this.#toastTimer) clearTimeout(this.#toastTimer);
    if (this.#container) this.#container.innerHTML = "";
  }


  #render() {
    if (!this.#container) return;

    const presets = this.#manager.getAll();

    let html = `<div class="preset-picker">`;

    html += `
      <div class="preset-picker__header">
        <span class="preset-picker__title">Presets</span>
        <button id="preset-toggle-save" class="preset-save-row__btn preset-save-row__btn--${this.#shouldShowSaveInput ? 'cancel' : 'save'}" 
                style="height:28px; padding:0 12px; font-size:0.75rem;">
          ${this.#shouldShowSaveInput ? 'Cancel' : '＋ Save Current'}
        </button>
      </div>`;

    if (this.#shouldShowSaveInput) {
      html += `
        <div class="preset-save-row">
          <input type="text" id="preset-name-input" class="preset-save-row__input"
                 placeholder="Enter preset name..." maxlength="30" autocomplete="off" />
          <button id="preset-btn-save" class="preset-save-row__btn preset-save-row__btn--save">Save</button>
        </div>`;
    }

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


  #attachListeners() {
    const toggleBtn = this.#container.querySelector("#preset-toggle-save");
    if (toggleBtn) {
      toggleBtn.addEventListener("click", () => {
        this.#shouldShowSaveInput = !this.#shouldShowSaveInput;
        this.#render();
        if (this.#shouldShowSaveInput) {
          const input = this.#container.querySelector("#preset-name-input");
          if (input) input.focus();
        }
      });
    }

    const saveBtn = this.#container.querySelector("#preset-btn-save");
    if (saveBtn) {
      saveBtn.addEventListener("click", () => this.#handleSave());
    }

    const nameInput = this.#container.querySelector("#preset-name-input");
    if (nameInput) {
      nameInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") this.#handleSave();
        if (e.key === "Escape") {
          this.#shouldShowSaveInput = false;
          this.#render();
        }
      });
    }

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
    this.#shouldShowSaveInput = false;
    this.#showToast(`✅  Preset "${name}" saved`);
    this.#render();
  }

  #handleShare(name) {
    const url = this.#manager.getShareUrl(name);
    if (!url) return;

    navigator.clipboard.writeText(url).then(() => {
      this.#showToast("✅  Share link copied to clipboard!");
    }).catch(() => {
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
