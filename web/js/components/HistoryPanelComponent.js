
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
  #container = null;
  #manager = null;
  #bus = null;
  #isCollapsed = true; // collapsed by default

  constructor() {
    this.#manager = new HistoryManager();
    this.#bus = EventBus.getInstance();
  }

  mount(container) {
    this.#container = container;

    this.#bus.on("conversion:complete", (entry) => {
      this.#manager.add(entry);
      this.#render();
    });

    this.#render();
  }

  unmount() {
    if (this.#container) this.#container.innerHTML = "";
    this.#container = null;
  }


  #render() {
    if (!this.#container) return;

    const entries = this.#manager.getAll();
    const count = entries.length;

    if (count === 0) {
      this.#container.innerHTML = "";
      return;
    }

    const chevron = this.#isCollapsed ? "expand_more" : "expand_less";

    let html = `<div class="history-panel">`;

    html += `
      <button id="history-toggle" class="history-panel__header">
        <div class="history-panel__header-left">
          <span class="material-symbols-outlined history-panel__icon">history</span>
          <span class="history-panel__title">Recent Conversions</span>
          <span class="history-panel__badge">${count}</span>
        </div>
        <span class="material-symbols-outlined history-panel__chevron">${chevron}</span>
      </button>`;

    if (!this.#isCollapsed) {
      html += `<div class="history-panel__body">`;

      for (const entry of entries) {
        const isExpired = entry.expired === true;
        const hasValidUrl = entry.downloadUrl && !entry.downloadUrl.includes("undefined") && !entry.downloadUrl.includes("null");
        const statusClass = isExpired || !hasValidUrl ? "history-item--expired" : "";

        html += `
          <div class="history-item ${statusClass}">
            <div class="history-item__info">
              <span class="history-item__name" title="${escapeHTML(entry.filename ?? 'Unknown')}">${escapeHTML(entry.filename ?? 'Unknown')}</span>
              <span class="history-item__meta">
                ${entry.format?.toUpperCase() || ""} • ${entry.sizeMb != null && !isNaN(entry.sizeMb) ? Number(entry.sizeMb).toFixed(1) + " MB" : "—"} • ${formatTimestamp(entry.timestamp)}
              </span>
            </div>
            <div class="history-item__actions">
              ${expired || !hasValidUrl
                ? `<span class="history-item__expired-label" title="Link expired or unavailable">Expired</span>`
                : `<button class="history-item__download btn-download-history"
                     data-url="${escapeHTML(entry.downloadUrl)}"
                     data-filename="${escapeHTML(entry.filename ?? 'download')}"
                     data-format="${escapeHTML(entry.format ?? '')}"
                     title="Download">
                    <span class="material-symbols-outlined" style="font-size:16px">download</span>
                   </button>`
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
    const toggleBtn = this.#container?.querySelector("#history-toggle");
    if (toggleBtn) {
      toggleBtn.addEventListener("click", () => {
        this.#isCollapsed = !this.#isCollapsed;
        this.#render();
      });
    }

    const clearBtn = this.#container?.querySelector("#history-clear");
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        this.#manager.clear();
        this.#isCollapsed = true;
        this.#render();
      });
    }

    const downloadBtns = this.#container?.querySelectorAll(".btn-download-history") || [];
    for (const btn of downloadBtns) {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        this.#handleHistoryDownload(btn);
      });
    }
  }

  async #handleHistoryDownload(btn) {
    const url = btn.getAttribute("data-url");
    const filename = btn.getAttribute("data-filename") || "download";
    const format = btn.getAttribute("data-format") || "mp3";
    const originalHTML = btn.innerHTML;

    if (!url || url.includes("undefined") || url.includes("null")) {
      btn.innerHTML = '<span style="font-size:12px">Expired</span>';
      btn.disabled = true;
      const entries = this.#manager.getAll();
      const entry = entries.find(en => en.downloadUrl === url);
      if (entry) this.#manager.markExpired(entry.jobId);
      return;
    }

    btn.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px">hourglass_top</span>';
    btn.disabled = true;

    try {
      const res = await fetch(url);

      const contentType = res.headers.get("Content-Type") ?? "";
      if (contentType.includes("application/json")) {
        const err = await res.json();
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const blob = await res.blob();
      const dlUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = dlUrl;
      a.download = `${filename}_8d.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(dlUrl);

      btn.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px">check</span>';
      setTimeout(() => {
        btn.innerHTML = originalHTML;
        btn.disabled = false;
      }, 2000);

    } catch (err) {
      console.error("[HISTORY_DOWNLOAD]", err.message);

      if (err.message.includes("expired") || err.message.includes("410")) {
        btn.innerHTML = '<span style="font-size:12px">Expired</span>';
        btn.disabled = true;
        const entries = this.#manager.getAll();
        const entry = entries.find(en => en.downloadUrl === url);
        if (entry) this.#manager.markExpired(entry.jobId);
      } else {
        btn.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px">error</span>';
        setTimeout(() => {
          btn.innerHTML = originalHTML;
          btn.disabled = false;
        }, 3000);
      }
    }
  }
}
