// web/js/components/HistoryPanelComponent.js
// Collapsible panel showing conversion history.
// Uses EventBus for communication — listens to "conversion:complete".

import { EventBus } from "../core/EventBus.js";
import { HistoryManager } from "../services/HistoryManager.js";

function escapeHTML(str) {
  const el = document.createElement("div");
  el.appendChild(document.createTextNode(str));
  return el.innerHTML;
}

function formatTimestamp(ts) {
  const d = new Date(ts);
  const now = new Date();
  const diff = now - d;

  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;

  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export class HistoryPanelComponent {
  /** @type {HTMLElement|null} */
  #container = null;
  /** @type {HistoryManager} */
  #manager = null;
  /** @type {EventBus} */
  #bus = null;
  /** @type {boolean} */
  #collapsed = true; // collapsed by default

  constructor() {
    this.#manager = new HistoryManager();
    this.#bus = EventBus.getInstance();
  }

  /**
   * Mount into a DOM container.
   * @param {HTMLElement} container
   */
  mount(container) {
    this.#container = container;

    // Listen for new conversion completions
    this.#bus.on("conversion:complete", (entry) => {
      this.#manager.add(entry);
      this.#render();
    });

    this.#render();
  }

  /**
   * Clean up.
   */
  unmount() {
    if (this.#container) this.#container.innerHTML = "";
    this.#container = null;
  }

  // ── Private ────────────────────────────────────────────────

  #render() {
    if (!this.#container) return;

    const entries = this.#manager.getAll();
    const count = entries.length;

    if (count === 0) {
      this.#container.innerHTML = "";
      return;
    }

    const chevron = this.#collapsed ? "expand_more" : "expand_less";

    let html = `<div class="history-panel">`;

    // Header
    html += `
      <button id="history-toggle" class="history-panel__header">
        <div class="history-panel__header-left">
          <span class="material-symbols-outlined history-panel__icon">history</span>
          <span class="history-panel__title">Recent Conversions</span>
          <span class="history-panel__badge">${count}</span>
        </div>
        <span class="material-symbols-outlined history-panel__chevron">${chevron}</span>
      </button>`;

    // Collapsible body
    if (!this.#collapsed) {
      html += `<div class="history-panel__body">`;

      for (const entry of entries) {
        const expired = entry.expired === true;
        const statusClass = expired ? "history-item--expired" : "";

        html += `
          <div class="history-item ${statusClass}">
            <div class="history-item__info">
              <span class="history-item__name" title="${escapeHTML(entry.filename)}">${escapeHTML(entry.filename)}</span>
              <span class="history-item__meta">
                ${entry.format?.toUpperCase() || ""} • ${entry.sizeMb || "?"} MB • ${formatTimestamp(entry.timestamp)}
              </span>
            </div>
            <div class="history-item__actions">
              ${expired
                ? `<span class="history-item__expired-label" title="Links expire after 30 min">Expired</span>`
                : `<a class="history-item__download" href="${escapeHTML(entry.downloadUrl)}" download="${escapeHTML(entry.filename)}" title="Download">
                    <span class="material-symbols-outlined" style="font-size:16px">download</span>
                   </a>`
              }
            </div>
          </div>`;
      }

      html += `
        <button id="history-clear" class="history-panel__clear">
          <span class="material-symbols-outlined" style="font-size:14px">delete</span>
          Clear History
        </button>
      </div>`;
    }

    html += `</div>`;

    this.#container.innerHTML = html;
    this.#attachListeners();
  }

  #attachListeners() {
    // Toggle collapse
    const toggleBtn = this.#container?.querySelector("#history-toggle");
    if (toggleBtn) {
      toggleBtn.addEventListener("click", () => {
        this.#collapsed = !this.#collapsed;
        this.#render();
      });
    }

    // Clear history
    const clearBtn = this.#container?.querySelector("#history-clear");
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        this.#manager.clear();
        this.#collapsed = true;
        this.#render();
      });
    }

    // Check download links — mark expired on 404
    const downloadLinks = this.#container?.querySelectorAll(".history-item__download") || [];
    for (const link of downloadLinks) {
      link.addEventListener("click", async (e) => {
        const url = link.getAttribute("href");
        try {
          const resp = await fetch(url, { method: "HEAD" });
          if (resp.status === 404) {
            e.preventDefault();
            // Find jobId from the entry by matching downloadUrl
            const entries = this.#manager.getAll();
            const entry = entries.find(en => en.downloadUrl === url);
            if (entry) {
              this.#manager.markExpired(entry.jobId);
              this.#render();
            }
          }
        } catch {
          // Network error — let the download attempt proceed
        }
      });
    }
  }
}
