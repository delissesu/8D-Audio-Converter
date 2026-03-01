// web/js/components/FileQueueComponent.js
// Multi-file queue UI for batch conversion.
// Uses EventBus for communication — emits "batch:start", "batch:done".

import { EventBus } from "../core/EventBus.js";

function escapeHTML(str) {
  const el = document.createElement("div");
  el.appendChild(document.createTextNode(str));
  return el.innerHTML;
}

export class FileQueueComponent {
  /** @type {HTMLElement|null} */
  #container = null;
  /** @type {EventBus} */
  #bus = null;
  /** @type {File[]} */
  #files = [];
  /** @type {string|null} */
  #batchId = null;
  /** @type {object[]} */
  #jobStatuses = [];
  /** @type {number|null} */
  #pollInterval = null;
  /** @type {boolean} */
  #converting = false;

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
  }

  /**
   * Clean up.
   */
  unmount() {
    this.#stopPolling();
    if (this.#container) this.#container.innerHTML = "";
    this.#container = null;
  }

  /**
   * Add files from a file input or drag-and-drop.
   * @param {FileList|File[]} files
   */
  addFiles(files) {
    const arr = Array.from(files);
    // Limit to 20 files total
    const remaining = 20 - this.#files.length;
    const toAdd = arr.slice(0, remaining);

    for (const f of toAdd) {
      // Deduplicate by name+size
      const exists = this.#files.some(
        (existing) => existing.name === f.name && existing.size === f.size
      );
      if (!exists) {
        this.#files.push(f);
      }
    }

    this.#render();
  }

  /**
   * Remove a file from the queue by index.
   * @param {number} index
   */
  removeFile(index) {
    if (index >= 0 && index < this.#files.length) {
      this.#files.splice(index, 1);
      this.#render();
    }
  }

  /**
   * Clear all files and reset state.
   */
  clear() {
    this.#files = [];
    this.#batchId = null;
    this.#jobStatuses = [];
    this.#converting = false;
    this.#stopPolling();
    this.#render();
  }

  /**
   * @returns {number}
   */
  get fileCount() {
    return this.#files.length;
  }

  // ── Private ────────────────────────────────────────────────

  #render() {
    if (!this.#container) return;

    if (this.#files.length === 0 && !this.#converting) {
      this.#container.innerHTML = "";
      return;
    }

    let html = `<div class="file-queue">`;

    // Header
    html += `
      <div class="file-queue__header">
        <div class="file-queue__header-left">
          <span class="material-symbols-outlined file-queue__icon">queue_music</span>
          <span class="file-queue__title">Batch Queue</span>
          <span class="file-queue__badge">${this.#files.length}</span>
        </div>
        ${!this.#converting ? `
          <button id="file-queue-clear" class="file-queue__clear-btn">Clear All</button>
        ` : ""}
      </div>`;

    // File list
    html += `<div class="file-queue__list">`;

    for (let i = 0; i < this.#files.length; i++) {
      const file = this.#files[i];
      const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
      const jobStatus = this.#jobStatuses[i] || null;

      let statusHtml = "";
      if (jobStatus) {
        const st = jobStatus.status;
        if (st === "done") {
          statusHtml = `<span class="file-queue__status file-queue__status--done">
            <span class="material-symbols-outlined" style="font-size:14px">check_circle</span> Done
          </span>`;
        } else if (st === "error") {
          statusHtml = `<span class="file-queue__status file-queue__status--error" title="${escapeHTML(jobStatus.error || '')}">
            <span class="material-symbols-outlined" style="font-size:14px">error</span> Error
          </span>`;
        } else if (st === "processing") {
          statusHtml = `<span class="file-queue__status file-queue__status--processing">
            <span class="material-symbols-outlined file-queue__spin" style="font-size:14px">progress_activity</span>
            ${jobStatus.progress || 0}%
          </span>`;
        } else {
          statusHtml = `<span class="file-queue__status file-queue__status--queued">Queued</span>`;
        }
      }

      html += `
        <div class="file-queue__item ${jobStatus?.status === 'done' ? 'file-queue__item--done' : ''} ${jobStatus?.status === 'error' ? 'file-queue__item--error' : ''}">
          <div class="file-queue__item-info">
            <span class="file-queue__item-name" title="${escapeHTML(file.name)}">${escapeHTML(file.name)}</span>
            <span class="file-queue__item-meta">${sizeMb} MB</span>
          </div>
          <div class="file-queue__item-actions">
            ${statusHtml}
            ${!this.#converting ? `
              <button class="file-queue__remove-btn" data-index="${i}" title="Remove">
                <span class="material-symbols-outlined" style="font-size:16px">close</span>
              </button>
            ` : ""}
          </div>
        </div>`;
    }

    html += `</div>`; // end list

    // Actions footer
    if (!this.#converting && this.#files.length > 0 && !this.#batchId) {
      html += `
        <div class="file-queue__footer">
          <button id="file-queue-add-more" class="file-queue__add-btn">
            <span class="material-symbols-outlined" style="font-size:16px">add</span> Add More
          </button>
          <button id="file-queue-convert" class="file-queue__convert-btn">
            <span class="material-symbols-outlined" style="font-size:16px">bolt</span>
            Convert All (${this.#files.length})
          </button>
        </div>`;
    }

    // Download ZIP button (when batch is done)
    if (this.#batchId && !this.#converting) {
      const doneCount = this.#jobStatuses.filter(j => j?.status === "done").length;
      if (doneCount > 0) {
        html += `
          <div class="file-queue__footer">
            <button id="file-queue-download-zip" class="file-queue__convert-btn file-queue__convert-btn--download">
              <span class="material-symbols-outlined" style="font-size:16px">folder_zip</span>
              Download ZIP (${doneCount} files)
            </button>
            <button id="file-queue-new-batch" class="file-queue__add-btn">
              New Batch
            </button>
          </div>`;
      }
    }

    html += `</div>`; // end file-queue

    this.#container.innerHTML = html;
    this.#attachListeners();
  }

  #attachListeners() {
    // Clear all
    this.#container?.querySelector("#file-queue-clear")?.addEventListener("click", () => {
      this.clear();
    });

    // Remove individual
    this.#container?.querySelectorAll(".file-queue__remove-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.dataset.index, 10);
        this.removeFile(idx);
      });
    });

    // Add more (hidden file input)
    this.#container?.querySelector("#file-queue-add-more")?.addEventListener("click", () => {
      const input = document.createElement("input");
      input.type = "file";
      input.multiple = true;
      input.accept = ".mp3,.wav,.flac,.ogg,.aac,.m4a";
      input.onchange = () => {
        if (input.files?.length) {
          this.addFiles(input.files);
        }
      };
      input.click();
    });

    // Convert all
    this.#container?.querySelector("#file-queue-convert")?.addEventListener("click", () => {
      this.#startBatchConversion();
    });

    // Download ZIP
    this.#container?.querySelector("#file-queue-download-zip")?.addEventListener("click", () => {
      if (this.#batchId) {
        const a = document.createElement("a");
        a.href = `/batch-download/${this.#batchId}`;
        a.download = "8d_audio_batch.zip";
        a.click();
      }
    });

    // New batch
    this.#container?.querySelector("#file-queue-new-batch")?.addEventListener("click", () => {
      this.clear();
    });
  }

  async #startBatchConversion() {
    if (this.#files.length === 0 || this.#converting) return;

    this.#converting = true;
    this.#jobStatuses = this.#files.map(() => ({
      status: "queued",
      progress: 0,
      step: "Waiting to start",
    }));
    this.#render();

    this.#bus.emit("batch:start", { count: this.#files.length });

    // Build FormData with all files
    const formData = new FormData();

    for (const file of this.#files) {
      formData.append("files[]", file);
    }

    // Read current params from sliders via EventBus request
    const params = await new Promise((resolve) => {
      const handler = (p) => {
        resolve(p);
      };
      this.#bus.on("preset:request-params-response", handler);
      this.#bus.emit("preset:request-params");
      // Fallback if no response
      setTimeout(() => resolve(null), 100);
    });

    if (params) {
      // Map UI params to server keys
      const speedSeconds = params.pan_speed || 8;
      const panSpeedHz = Math.min(2.0, Math.max(0.01, 1.0 / speedSeconds));
      formData.append("speed", panSpeedHz);
      formData.append("depth", params.pan_depth || 1.0);
      formData.append("room", params.room_size || 0.2);
      formData.append("wet", params.wet_level || 0.15);
      formData.append("damping", params.damping || 0.5);
    }

    // Get format from radio buttons
    const formatRadio = document.querySelector('input[name="format"]:checked');
    formData.append("format", formatRadio?.value || "mp3");

    try {
      const response = await fetch("/batch-convert", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Batch conversion failed");
      }

      const data = await response.json();
      this.#batchId = data.batchId;
      this.#startPolling();

    } catch (err) {
      this.#converting = false;
      this.#jobStatuses = [];
      alert("Batch conversion failed: " + err.message);
      this.#render();
    }
  }

  #startPolling() {
    this.#pollInterval = setInterval(async () => {
      if (!this.#batchId) return;

      try {
        const resp = await fetch(`/batch-status/${this.#batchId}`);
        if (!resp.ok) return;

        const data = await resp.json();

        // Update job statuses
        this.#jobStatuses = data.jobs.map((j) => ({
          status: j.status,
          progress: j.progress,
          step: j.step,
          error: j.error,
        }));

        this.#render();

        // Check if batch is done
        if (data.status === "done") {
          this.#stopPolling();
          this.#converting = false;
          this.#bus.emit("batch:done", {
            total: data.total,
            done: data.done,
            failed: data.failed,
            batchId: this.#batchId,
          });
          this.#render();
        }
      } catch {
        // Network error — continue polling
      }
    }, 1000);
  }

  #stopPolling() {
    if (this.#pollInterval !== null) {
      clearInterval(this.#pollInterval);
      this.#pollInterval = null;
    }
  }
}
