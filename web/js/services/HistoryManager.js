// web/js/services/HistoryManager.js
// Manages conversion history in localStorage.
// Max 20 entries, oldest removed when limit exceeded.

const STORAGE_KEY = "8d_converter_history";
const MAX_ENTRIES = 20;

export class HistoryManager {
  /** @type {Array<object>} */
  #entries = [];

  constructor() {
    this.#load();
  }

  /**
   * Get all history entries, newest first.
   * @returns {Array<{jobId, filename, format, sizeMb, elapsed, downloadUrl, timestamp}>}
   */
  getAll() {
    return [...this.#entries];
  }

  /**
   * Add a new entry after a conversion completes.
   * @param {object} entry — { jobId, filename, format, sizeMb, elapsed, downloadUrl }
   */
  add(entry) {
    const record = {
      ...entry,
      timestamp: Date.now(),
    };

    // Remove duplicate by jobId if exists
    this.#entries = this.#entries.filter(e => e.jobId !== entry.jobId);

    // Prepend newest
    this.#entries.unshift(record);

    // Enforce limit
    if (this.#entries.length > MAX_ENTRIES) {
      this.#entries = this.#entries.slice(0, MAX_ENTRIES);
    }

    this.#persist();
  }

  /**
   * Mark an entry as expired (download link no longer valid).
   * @param {string} jobId
   */
  markExpired(jobId) {
    const entry = this.#entries.find(e => e.jobId === jobId);
    if (entry) {
      entry.expired = true;
      this.#persist();
    }
  }

  /**
   * Clear all history entries.
   */
  clear() {
    this.#entries = [];
    this.#persist();
  }

  /**
   * Get the number of entries.
   * @returns {number}
   */
  get count() {
    return this.#entries.length;
  }

  // ── Private ────────────────────────────────────────────────

  #load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        this.#entries = JSON.parse(raw);
      }
    } catch {
      this.#entries = [];
    }
  }

  #persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.#entries));
    } catch {
      // localStorage full or unavailable
    }
  }
}
